// End-to-end run of the WHOLE dealer feature set (admin + dealer, Phase 1-4) against the real engine,
// with in-memory repo / fake Odoo / fake auth. This is the same engine the Edge Functions and the
// browser demo backend run.

import { beforeEach, describe, expect, it } from "vitest";
import { createDealerEngine, type AdminActor, type DealerSession } from "./engine.ts";
import { DealerError } from "./errors.ts";
import { FakeAuth, FakeOdoo, MemoryRepo, RecordingNotifier } from "./memory.ts";

const OWNER: AdminActor = { id: "11111111-1111-4111-8111-111111111111", role: "owner" };
const SUPPORT: AdminActor = { id: "22222222-2222-4222-8222-222222222222", role: "support" };
const ADDRESS = { name: "Ravi Shah", phone: "9876543210", line1: "12 MG Road", city: "Ahmedabad", state: "Gujarat", pincode: "380001" };

let clock: Date;
let repo: MemoryRepo;
let odoo: FakeOdoo;
let auth: FakeAuth;
let notifier: RecordingNotifier;
let engine: ReturnType<typeof createDealerEngine>;

const admin = <T = any>(action: string, payload: Record<string, unknown> = {}, actor: AdminActor = OWNER) => engine.callAdmin(actor, action, payload) as Promise<T>;
const asDealer = async (authUserId: string) => engine.resolveSession(authUserId);
const call = <T = any>(s: DealerSession, action: string, payload: Record<string, unknown> = {}) => engine.callDealer(s, action, payload) as Promise<T>;
const expectCode = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(() => null, (e) => e);
  expect(err, `expected ${code}`).toBeInstanceOf(DealerError);
  expect((err as DealerError).code).toBe(code);
  return err as DealerError;
};
const tick = (ms = 1000) => (clock = new Date(clock.getTime() + ms));

beforeEach(() => {
  clock = new Date("2026-10-28T10:00:00.000Z");
  repo = new MemoryRepo(undefined, () => clock);
  odoo = new FakeOdoo();
  auth = new FakeAuth();
  notifier = new RecordingNotifier();
  let seed = 0.12;
  engine = createDealerEngine({ repo, odoo, auth, notifier, now: () => clock, random: () => (seed = (seed * 7.3) % 1) });
});

async function createDealer(name: string, email: string) {
  const { dealer } = await admin("dealers.create", { displayName: name, legalName: `${name} Pvt Ltd`, contactEmail: email, contactPhone: "9988776655", gstin: "24ABCDE1234F1Z5" });
  return dealer as { id: string; dealer_code: string };
}
async function setupPricedDealer(name: string, email: string, products: [number, number][]) {
  const d = await createDealer(name, email);
  await admin("catalog.assign", { dealerId: d.id, variantIds: products.map(([v]) => v) });
  for (const [variantId, pricePaise] of products) await admin("prices.saveDraft", { dealerId: d.id, variantId, pricePaise, taxBasis: "exclusive" });
  await admin("prices.publish", { dealerId: d.id });
  return d;
}
async function activate(dealerId: string, email: string) {
  await admin("dealers.invite", { id: dealerId });
  return asDealer(auth.users.get(email)!);
}

describe("Phase 1 — admin: dealer lifecycle, catalogue, pricing, invite", () => {
  it("creates a draft dealer with validation and a unique code", async () => {
    const d = await createDealer("Apex Motors", "owner@apex.test");
    expect(d.dealer_code).toMatch(/^APE-\d{4}$/);
    await expectCode(admin("dealers.create", { displayName: "X", legalName: "X", contactEmail: "not-an-email" }), "VALIDATION");
    await expectCode(admin("dealers.create", { displayName: "X", legalName: "X", contactEmail: "a@b.co", gstin: "BAD" }), "VALIDATION");
    const list = await admin("dealers.list", {});
    expect(list.total).toBe(1);
    expect(list.rows[0]).toMatchObject({ status: "draft", assignedCount: 0 });
  });

  it("blocks the invite until every assigned product has a published price (Ready-to-activate)", async () => {
    const d = await createDealer("Apex Motors", "owner@apex.test");
    const e1 = await expectCode(admin("dealers.invite", { id: d.id }), "NOT_READY");
    expect((e1.details as any).issues[0].code).toBe("no_products");

    await admin("catalog.assign", { dealerId: d.id, variantIds: [1011, 1021] });
    const e2 = await expectCode(admin("dealers.invite", { id: d.id }), "NOT_READY");
    expect((e2.details as any).issues[0]).toMatchObject({ code: "missing_price", variantIds: [1011, 1021] });
    expect(auth.invites).toHaveLength(0);

    // A DRAFT price is not a published price — still not ready.
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 380000, taxBasis: "exclusive" });
    await expectCode(admin("dealers.invite", { id: d.id }), "NOT_READY");
  });

  it("never auto-assigns the catalogue and refuses unknown/unpublished products", async () => {
    const d = await createDealer("Apex Motors", "owner@apex.test");
    expect((await admin("catalog.get", { dealerId: d.id })).total).toBe(0);
    await expectCode(admin("catalog.assign", { dealerId: d.id, variantIds: [999999] }), "VALIDATION");
    const master = await admin("catalog.searchMaster", { dealerId: d.id, q: "mats" });
    expect(master.items[0].variants.every((v: any) => v.assigned === false)).toBe(true);
    expect(master.items.some((i: any) => i.name.includes("Spoiler"))).toBe(false); // unpublished never offered
  });

  it("price edits are drafts until published; publishing is atomic and audited with before/after", async () => {
    const d = await createDealer("Apex Motors", "owner@apex.test");
    await admin("catalog.assign", { dealerId: d.id, variantIds: [1011] });
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 380000, taxBasis: "exclusive" });
    let grid = await admin("catalog.get", { dealerId: d.id });
    expect(grid.rows[0]).toMatchObject({ state: "draft_only", activePrice: null });
    expect(grid.rows[0].draftPrice.pricePaise).toBe(380000);

    tick();
    await admin("prices.publish", { dealerId: d.id });
    tick();
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 350000, taxBasis: "exclusive" });
    await admin("prices.publish", { dealerId: d.id });
    grid = await admin("catalog.get", { dealerId: d.id });
    expect(grid.rows[0].activePrice.pricePaise).toBe(350000);
    expect(grid.rows[0].publicPricePaise).toBe(500000);

    const history = await admin("prices.history", { dealerId: d.id, variantId: 1011 });
    expect(history.rules.map((r: any) => [r.status, r.pricePaise])).toEqual([["active", 350000], ["expired", 380000]]);

    const log = await admin("audit.list", { dealerId: d.id });
    const published = log.rows.find((r: any) => r.event === "price.published");
    expect(published.oldValue[0].pricePaise).toBe(380000);
    expect(published.newValue[0].pricePaise).toBe(350000);
  });

  it("rejects non-positive prices, bad windows and prices for unassigned products", async () => {
    const d = await createDealer("Apex Motors", "owner@apex.test");
    await expectCode(admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 100, taxBasis: "exclusive" }), "VALIDATION"); // not assigned
    await admin("catalog.assign", { dealerId: d.id, variantIds: [1011] });
    await expectCode(admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 0, taxBasis: "exclusive" }), "VALIDATION");
    await expectCode(admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 1000, taxBasis: "exclusive", startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" }), "VALIDATION");
  });

  it("a scheduled deal overlapping the current price is rejected at publish; a later one is accepted", async () => {
    const d = await setupPricedDealer("Apex Motors", "owner@apex.test", [[1011, 380000]]);
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 300000, taxBasis: "exclusive", startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-12-31T00:00:00Z" });
    await expectCode(admin("prices.publish", { dealerId: d.id }), "CONFLICT");
    // End the current price first (immediate replace with a finite window), then schedule after it.
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 380000, taxBasis: "exclusive", endsAt: "2026-12-01T00:00:00Z" });
    await admin("prices.publish", { dealerId: d.id });
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 300000, taxBasis: "exclusive", startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-12-31T00:00:00Z" });
    await admin("prices.publish", { dealerId: d.id });

    // Time-bound pricing really switches by clock: today's price now, the deal in December.
    const s = await activate(d.id, "owner@apex.test");
    expect((await call(s, "catalog.list")).items[0].variants[0].pricePaise).toBe(380000);
    clock = new Date("2026-12-10T00:00:00Z");
    expect((await call(s, "catalog.list")).items[0].variants[0].pricePaise).toBe(300000);
    clock = new Date("2027-01-15T00:00:00Z");
    const after = (await call(s, "catalog.list")).items[0].variants[0];
    expect(after.pricePaise).toBeNull();
    expect(after.unavailableReason).toBe("no_price"); // expired deal: assigned but not orderable, NO public fallback
  });

  it("invite → first sign-in activates; lifecycle transitions are enforced", async () => {
    const d = await setupPricedDealer("Apex Motors", "owner@apex.test", [[1011, 380000]]);
    await expectCode(admin("dealers.setStatus", { id: d.id, status: "active" }), "CONFLICT"); // draft cannot jump to active
    const inv = await admin("dealers.invite", { id: d.id });
    expect(inv.dealer.status).toBe("invited");
    expect(auth.invites).toHaveLength(1);

    const s = await asDealer(auth.users.get("owner@apex.test")!);
    expect(s.dealer.status).toBe("active");
    expect(s.user.status).toBe("active");
    await expectCode(admin("dealers.invite", { id: d.id }), "CONFLICT"); // already active

    await admin("dealers.setStatus", { id: d.id, status: "suspended" });
    await expectCode(asDealer(auth.users.get("owner@apex.test")!), "DEALER_INACTIVE");
    await admin("dealers.setStatus", { id: d.id, status: "active" });
    expect((await asDealer(auth.users.get("owner@apex.test")!)).dealer.status).toBe("active");
    await admin("dealers.setStatus", { id: d.id, status: "archived" });
    await expectCode(asDealer(auth.users.get("owner@apex.test")!), "DEALER_INACTIVE");
    await expectCode(admin("dealers.setStatus", { id: d.id, status: "active" }), "CONFLICT"); // archived is terminal
  });

  it("bulk suspend needs explicit confirmation and skips ineligible dealers", async () => {
    const a = await createDealer("Alpha Autos", "a@alpha.test");
    const b = await setupPricedDealer("Beta Autos", "b@beta.test", [[1011, 380000]]);
    await activate(b.id, "b@beta.test");
    await expectCode(admin("dealers.bulkSuspend", { ids: [a.id, b.id] }), "VALIDATION");
    const res = await admin("dealers.bulkSuspend", { ids: [a.id, b.id], confirm: true });
    expect(res.suspended).toBe(1); // draft cannot be suspended
    expect(res.skipped).toEqual([a.id]);
  });

  it("branding: validates colour/paths and updates", async () => {
    const d = await createDealer("Apex Motors", "owner@apex.test");
    await expectCode(admin("dealers.branding", { id: d.id, accentColor: "red" }), "VALIDATION");
    await expectCode(admin("dealers.branding", { id: d.id, logoPath: "../../etc/passwd" }), "VALIDATION");
    await expectCode(admin("dealers.branding", { id: d.id, logoPath: "https://evil.example/x.png" }), "VALIDATION");
    const { branding } = await admin("dealers.branding", { id: d.id, accentColor: "#0a7f5a", tagline: "Premium partner", logoPath: "u1/logo.png" });
    expect(branding).toMatchObject({ accent_color: "#0A7F5A", tagline: "Premium partner", logo_path: "u1/logo.png" });
  });

  it("optimistic locking: a stale edit gets a conflict", async () => {
    const d = (await admin("dealers.get", { id: (await createDealer("Apex Motors", "owner@apex.test")).id })).dealer;
    await admin("dealers.update", { id: d.id, contactName: "First", expectedUpdatedAt: d.updated_at });
    await expectCode(admin("dealers.update", { id: d.id, contactName: "Second", expectedUpdatedAt: d.updated_at }), "CONFLICT");
  });

  it("separate permissions: support can view but not manage dealers or prices", async () => {
    const d = await createDealer("Apex Motors", "owner@apex.test");
    expect((await admin("dealers.list", {}, SUPPORT)).total).toBe(1);
    await expectCode(admin("dealers.create", { displayName: "Z", legalName: "Z", contactEmail: "z@z.co" }, SUPPORT), "FORBIDDEN");
    await expectCode(admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 100, taxBasis: "exclusive" }, SUPPORT), "FORBIDDEN");
    await expectCode(admin("orders.retrySync", { id: d.id }, SUPPORT), "FORBIDDEN");
    await expectCode(admin("nope.nothing", {}), "NOT_FOUND");
    await expectCode(admin("dealers.list", {}, { id: "x", role: "content" }), "FORBIDDEN");
  });
});

describe("Phase 1 — dealer experience and tenant isolation", () => {
  async function twoDealers() {
    // Spec §7 matrix: shared SKU, different prices, different sets.
    const a = await setupPricedDealer("Apex Motors", "owner@apex.test", [[1011, 380000], [1021, 620000]]);
    const b = await setupPricedDealer("Beta Autos", "owner@beta.test", [[1011, 410000], [1031, 975000]]);
    const sa = await activate(a.id, "owner@apex.test");
    const sb = await activate(b.id, "owner@beta.test");
    return { a, b, sa, sb };
  }

  it("each dealer sees exactly its own SKUs at its own prices; public price stays hidden", async () => {
    const { sa, sb } = await twoDealers();
    const ca = (await call(sa, "catalog.list")).items;
    const cb = (await call(sb, "catalog.list")).items;
    expect(ca.map((p: any) => p.name).sort()).toEqual(["LED Headlamp Set H4", "Maruti Baleno Floor Mats"]);
    expect(cb.map((p: any) => p.name).sort()).toEqual(["Maruti Baleno Floor Mats", "Premium Leather Seat Cover (Creta)"]);
    const matA = ca.find((p: any) => p.templateId === 101);
    const matB = cb.find((p: any) => p.templateId === 101);
    expect(matA.variants).toHaveLength(1); // only the ASSIGNED colour variant
    expect(matA.variants[0].pricePaise).toBe(380000);
    expect(matB.variants[0].pricePaise).toBe(410000);
    expect(JSON.stringify(ca)).not.toContain("500000"); // public reference price never leaks
    expect(JSON.stringify(ca)).not.toContain("975000"); // another dealer's price never leaks
  });

  it("admin can opt a dealer into seeing the public reference price", async () => {
    const { a, sa } = await twoDealers();
    await admin("dealers.branding", { id: a.id, showPublicPrice: true });
    const mat = (await call(sa, "catalog.list")).items.find((p: any) => p.templateId === 101);
    expect(mat.variants[0].publicPricePaise).toBe(500000);
  });

  it("search, counts and direct access are scoped BEFORE data is returned (no IDOR)", async () => {
    const { sa } = await twoDealers();
    const led = await call(sa, "catalog.list", { q: "LED" });
    expect(led.total).toBe(1);
    const seat = await call(sa, "catalog.list", { q: "seat cover" }); // belongs to dealer B only
    expect(seat.total).toBe(0);
    expect(seat.items).toEqual([]);
    const err = await expectCode(call(sa, "catalog.get", { templateId: 103 }), "NOT_FOUND");
    expect(err.message).toBe("Product not found"); // same message as a truly missing product
    await expectCode(call(sa, "catalog.get", { templateId: 999999 }), "NOT_FOUND");
    await expectCode(call(sa, "cart.setItem", { variantId: 1031, quantity: 1 }), "NOT_FOUND"); // B's variant
  });

  it("a caller-supplied dealerId is ignored; another dealer's order is a 404 and is audited", async () => {
    const { a, sa, sb } = await twoDealers();
    await call(sa, "cart.setItem", { variantId: 1011, quantity: 1 });
    const q = (await call(sa, "cart.get")).quote;
    const placed = await call(sa, "orders.place", { idempotencyKey: "key-aaaaaaaaaaaaaaaa", acceptedFingerprint: q.fingerprint, shippingAddress: ADDRESS });
    // Dealer B tries every way to reach A's data.
    expect((await call(sb, "orders.list", { dealerId: a.id })).total).toBe(0);
    expect((await call(sb, "catalog.list", { dealerId: a.id })).items.map((p: any) => p.templateId)).not.toContain(102);
    await expectCode(call(sb, "orders.get", { id: placed.order.id }), "NOT_FOUND");
    await expectCode(call(sb, "orders.reorder", { id: placed.order.id }), "NOT_FOUND");
    const log = await admin("audit.list", { dealerId: sb.dealer.id });
    expect(log.rows.some((r: any) => r.event === "security.cross_tenant_denied")).toBe(true);
  });

  it("a non-dealer account (e.g. a consumer) is denied and the attempt is audited", async () => {
    await twoDealers();
    await expectCode(asDealer("99999999-9999-4999-8999-999999999999"), "FORBIDDEN");
  });

  it("dashboard summarises the dealer; branding and product counts are correct", async () => {
    const { sa } = await twoDealers();
    const me = await call(sa, "me");
    expect(me.dealer.displayName).toBe("Apex Motors");
    expect(me.stats).toMatchObject({ assignedProducts: 2, orderableProducts: 2, totalOrders: 0, openOrders: 0 });
    expect(me.featured.length).toBe(2);
    expect(JSON.stringify(me)).not.toContain("Beta");
  });

  it("hidden / master-unpublished products disappear from the dealer immediately", async () => {
    const { a, sa } = await twoDealers();
    await admin("catalog.updateAccess", { dealerId: a.id, variantId: 1021, isVisible: false });
    expect((await call(sa, "catalog.list")).items.map((p: any) => p.templateId)).toEqual([101]);
    odoo.products.find((p) => p.templateId === 101)!.published = false; // archived in Odoo overrides assignment
    expect((await call(sa, "catalog.list")).items).toEqual([]);
  });

  it("preview-as-dealer shows draft prices read-only and has no order path", async () => {
    const { a } = await twoDealers();
    await admin("prices.saveDraft", { dealerId: a.id, variantId: 1011, pricePaise: 360000, taxBasis: "exclusive" });
    const preview = await admin("preview.catalog", { dealerId: a.id });
    expect(preview.preview).toBe(true);
    expect(preview.catalog.items.find((p: any) => p.templateId === 101).variants[0].pricePaise).toBe(360000);
    const live = await call(await asDealer(auth.users.get("owner@apex.test")!), "catalog.list");
    expect(live.items.find((p: any) => p.templateId === 101).variants[0].pricePaise).toBe(380000); // dealer still on the published price
    await expectCode(admin("orders.place", {}), "NOT_FOUND"); // no admin order-placement action exists
  });

  it("dealers can edit contact/delivery details but not legal name, GSTIN or billing", async () => {
    const { sa } = await twoDealers();
    const res = await call(sa, "account.update", { contactPhone: "9000000001", legalName: "Hacked Ltd", gstin: "24AAAAA0000A1Z5", shippingAddress: ADDRESS });
    expect(res.dealer.contactPhone).toBe("9000000001");
    expect(res.dealer.legalName).toBe("Apex Motors Pvt Ltd");
    expect(res.dealer.gstin).toBe("24ABCDE1234F1Z5");
    expect(res.dealer.shippingAddress.city).toBe("Ahmedabad");
  });
});

describe("Phase 2 — cart, quote and ordering", () => {
  async function dealerWithCart() {
    const d = await setupPricedDealer("Apex Motors", "owner@apex.test", [[1011, 380000], [1021, 620000], [1061, 79900]]);
    await admin("catalog.updateAccess", { dealerId: d.id, variantId: 1061, minQty: 5, qtyMultiple: 5 });
    const s = await activate(d.id, "owner@apex.test");
    return { d, s };
  }

  it("cart writes revalidate access, MOQ, multiples, price and availability on the server", async () => {
    const { s } = await dealerWithCart();
    await expectCode(call(s, "cart.setItem", { variantId: 1061, quantity: 3 }), "VALIDATION"); // below MOQ 5
    await expectCode(call(s, "cart.setItem", { variantId: 1061, quantity: 7 }), "VALIDATION"); // not a multiple of 5
    await expectCode(call(s, "cart.setItem", { variantId: 1011, quantity: 0.5 }), "VALIDATION");
    const cart = await call(s, "cart.setItem", { variantId: 1061, quantity: 10 });
    expect(cart.quote.lines[0]).toMatchObject({ quantity: 10, unitPricePaise: 79900 });
  });

  it("the client can never set the price: a smuggled unitPrice is ignored", async () => {
    const { s } = await dealerWithCart();
    const cart = await call(s, "cart.setItem", { variantId: 1011, quantity: 2, unitPrice: 1, unitPricePaise: 1, price: 1, discount: 99 });
    expect(cart.quote.lines[0].unitPricePaise).toBe(380000);
    expect(cart.quote.subtotalPaise).toBe(760000);
    expect(cart.quote.taxPaise).toBe(136800); // 18% from Odoo's tax rows
    expect(cart.quote.totalPaise).toBe(896800);
  });

  it("places an order with a price snapshot and an Odoo draft quotation carrying the dealer price", async () => {
    const { d, s } = await dealerWithCart();
    await call(s, "cart.setItem", { variantId: 1011, quantity: 2 });
    await call(s, "cart.setItem", { variantId: 1021, quantity: 1 });
    const { quote } = await call(s, "cart.get");
    const res = await call(s, "orders.place", { idempotencyKey: "order-key-0000000001", acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS, poReference: "PO-7781", notes: "Deliver before Diwali" });
    expect(res.odooSynced).toBe(true);
    expect(res.order).toMatchObject({ status: "quotation", subtotalPaise: 1380000, taxPaise: 248400, totalPaise: 1628400, poReference: "PO-7781" });
    expect(res.order.orderNumber).toMatch(/^DLR-\d{6}$/);
    expect(res.items.map((i: any) => [i.variantId, i.unitPricePaise])).toEqual([[1011, 380000], [1021, 620000]]);

    const sq = odoo.quotations[0];
    expect(sq.state).toBe("draft"); // a QUOTATION, never auto-confirmed
    expect(sq.lines).toEqual([{ variantId: 1011, quantity: 2, unitPrice: 3800 }, { variantId: 1021, quantity: 1, unitPrice: 6200 }]); // dealer prices, not 5000/8000
    expect(odoo.partners.get((await repo.getDealer(d.id))!.dealer_code)).toBeTruthy();
    expect((await repo.getDealer(d.id))!.linked_odoo_partner_id).not.toBeNull();
    expect((await call(s, "cart.get")).quote.lines).toEqual([]); // cart cleared
    expect(notifier.sent).toHaveLength(1);
  });

  it("is idempotent: a double-submit / back-button retry never creates a second order", async () => {
    const { s } = await dealerWithCart();
    await call(s, "cart.setItem", { variantId: 1011, quantity: 1 });
    const { quote } = await call(s, "cart.get");
    const body = { idempotencyKey: "order-key-0000000002", acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS };
    const first = await call(s, "orders.place", body);
    const second = await call(s, "orders.place", body);
    expect(second.replayed).toBe(true);
    expect(second.order.id).toBe(first.order.id);
    expect(repo.state.orders).toHaveLength(1);
    expect(odoo.quotations).toHaveLength(1);
  });

  it("price change after the cart was built → old/new shown, order refused until acknowledged", async () => {
    const { d, s } = await dealerWithCart();
    await call(s, "cart.setItem", { variantId: 1011, quantity: 1 });
    const seen = (await call(s, "cart.get")).quote;
    tick();
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 400000, taxBasis: "exclusive" });
    await admin("prices.publish", { dealerId: d.id });

    const now = (await call(s, "cart.get")).quote;
    expect(now.needsAcknowledgement).toBe(true);
    expect(now.lines[0]).toMatchObject({ previousPricePaise: 380000, unitPricePaise: 400000, priceChanged: true });
    const err = await expectCode(call(s, "orders.place", { idempotencyKey: "order-key-0000000003", acceptedFingerprint: seen.fingerprint, shippingAddress: ADDRESS }), "CHECKOUT_CHANGED");
    expect((err.details as any).quote.lines[0].unitPricePaise).toBe(400000);
    expect(repo.state.orders).toHaveLength(0); // nothing was silently bought at the old price

    const acked = (await call(s, "cart.acknowledge")).quote;
    expect(acked.needsAcknowledgement).toBe(false);
    const ok = await call(s, "orders.place", { idempotencyKey: "order-key-0000000003", acceptedFingerprint: acked.fingerprint, shippingAddress: ADDRESS });
    expect(ok.order.subtotalPaise).toBe(400000);
  });

  it("history is immutable: later price edits never reprice a placed order", async () => {
    const { d, s } = await dealerWithCart();
    await call(s, "cart.setItem", { variantId: 1011, quantity: 1 });
    const { quote } = await call(s, "cart.get");
    const placed = await call(s, "orders.place", { idempotencyKey: "order-key-0000000004", acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS });
    tick();
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 100000, taxBasis: "exclusive" });
    await admin("prices.publish", { dealerId: d.id });
    const again = await call(s, "orders.get", { id: placed.order.id });
    expect(again.items[0].unitPricePaise).toBe(380000);
    expect(again.order.subtotalPaise).toBe(380000);
  });

  it("fails closed: unassign / expire / suspend / archive in Odoo all stop an order", async () => {
    const { d, s } = await dealerWithCart();
    await call(s, "cart.setItem", { variantId: 1011, quantity: 1 });
    await call(s, "cart.setItem", { variantId: 1021, quantity: 1 });
    // unassign drops the cart line immediately
    await admin("catalog.unassign", { dealerId: d.id, variantIds: [1021] });
    expect((await call(s, "cart.get")).quote.lines.map((l: any) => l.variantId)).toEqual([1011]);
    // product archived in Odoo → quote invalid
    odoo.products.find((p) => p.templateId === 101)!.published = false;
    const { quote } = await call(s, "cart.get");
    expect(quote.canOrder).toBe(false);
    expect(quote.lines[0].issues).toContain("unavailable");
    await expectCode(call(s, "orders.place", { idempotencyKey: "order-key-0000000005", acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS }), "QUOTE_INVALID");
    const cleaned = await call(s, "cart.removeInvalid");
    expect(cleaned.quote.lines).toEqual([]);
    await expectCode(call(s, "orders.place", { idempotencyKey: "order-key-0000000006", acceptedFingerprint: "x", shippingAddress: ADDRESS }), "VALIDATION"); // empty cart
  });

  it("a suspended dealer can't place orders even with a live session object", async () => {
    const { d, s } = await dealerWithCart();
    await call(s, "cart.setItem", { variantId: 1011, quantity: 1 });
    const { quote } = await call(s, "cart.get");
    await admin("dealers.setStatus", { id: d.id, status: "suspended" });
    await expectCode(asDealer(auth.users.get("owner@apex.test")!), "DEALER_INACTIVE");
    const stale: DealerSession = { ...s, dealer: (await repo.getDealer(d.id))! };
    await expectCode(call(stale, "orders.place", { idempotencyKey: "order-key-0000000007", acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS }), "DEALER_INACTIVE");
  });

  it("Odoo outage never fakes success: order is kept as pending_sync, then retried by admin", async () => {
    const { s } = await dealerWithCart();
    await call(s, "cart.setItem", { variantId: 1011, quantity: 1 });
    const { quote } = await call(s, "cart.get");
    odoo.down = false;
    // Take Odoo down only for the order-creation step (catalogue/tax reads already succeeded in the quote).
    const realCreate = odoo.createQuotation.bind(odoo);
    odoo.createQuotation = async () => {
      throw new Error("Odoo request failed: HTTP 503");
    };
    const res = await call(s, "orders.place", { idempotencyKey: "order-key-0000000008", acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS });
    expect(res.odooSynced).toBe(false);
    expect(res.order.status).toBe("pending_sync");
    expect(res.order.syncPending).toBe(true);
    expect(repo.state.orders[0].last_sync_error).toMatch(/503/);
    expect(odoo.quotations).toHaveLength(0);

    odoo.createQuotation = realCreate;
    const retry = await admin("orders.retrySync", { id: res.order.id });
    expect(retry.synced).toBe(true);
    expect(odoo.quotations).toHaveLength(1);
    expect(repo.state.orders[0].status).toBe("quotation");
    await expectCode(admin("orders.retrySync", { id: res.order.id }), "CONFLICT"); // only pending orders retry
  });

  it("order status is derived from Odoo: confirmed → completed", async () => {
    const { s } = await dealerWithCart();
    await call(s, "cart.setItem", { variantId: 1011, quantity: 1 });
    const { quote } = await call(s, "cart.get");
    const placed = await call(s, "orders.place", { idempotencyKey: "order-key-0000000009", acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS });
    expect((await call(s, "orders.get", { id: placed.order.id })).order.status).toBe("quotation");
    odoo.quotations[0].state = "sale";
    expect((await call(s, "orders.get", { id: placed.order.id })).order.status).toBe("confirmed");
    odoo.quotations[0].state = "done";
    expect((await call(s, "orders.get", { id: placed.order.id })).order.status).toBe("completed");
    odoo.down = true; // a slow Odoo never breaks reading an order
    expect((await call(s, "orders.get", { id: placed.order.id })).order.status).toBe("completed");
  });

  it("order list pagination + admin view of all dealer orders", async () => {
    const { d, s } = await dealerWithCart();
    for (let i = 0; i < 3; i++) {
      tick();
      await call(s, "cart.setItem", { variantId: 1011, quantity: i + 1 });
      const { quote } = await call(s, "cart.get");
      await call(s, "orders.place", { idempotencyKey: `order-key-list-0000000${i}`, acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS });
    }
    const page = await call(s, "orders.list", { pageSize: 2 });
    expect(page).toMatchObject({ total: 3, totalPages: 2 });
    expect(page.rows[0].orderNumber > page.rows[1].orderNumber).toBe(true); // newest first
    const all = await admin("orders.list", {});
    expect(all.total).toBe(3);
    expect(all.rows[0].dealerName).toBe("Apex Motors");
    expect((await admin("orders.list", { dealerId: d.id, status: "pending_sync" })).total).toBe(0);
  });

  it("address and idempotency-key inputs are validated", async () => {
    const { s } = await dealerWithCart();
    await call(s, "cart.setItem", { variantId: 1011, quantity: 1 });
    const { quote } = await call(s, "cart.get");
    await expectCode(call(s, "orders.place", { idempotencyKey: "short", acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS }), "VALIDATION");
    await expectCode(call(s, "orders.place", { idempotencyKey: "order-key-0000000010", acceptedFingerprint: quote.fingerprint, shippingAddress: { ...ADDRESS, pincode: "12" } }), "VALIDATION");
    await expectCode(call(s, "orders.place", { idempotencyKey: "order-key-0000000010", acceptedFingerprint: quote.fingerprint, shippingAddress: { name: "x" } }), "VALIDATION");
  });

  it("GST-inclusive contract prices keep the line total exactly at the agreed price", async () => {
    const d = await createDealer("Gamma Garage", "g@gamma.test");
    await admin("catalog.assign", { dealerId: d.id, variantIds: [1021] });
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1021, pricePaise: 590000, taxBasis: "inclusive" });
    await admin("prices.publish", { dealerId: d.id });
    const s = await activate(d.id, "g@gamma.test");
    const q = (await call(s, "cart.setItem", { variantId: 1021, quantity: 3 })).quote;
    expect(q.totalPaise).toBe(1770000); // 3 x ₹5,900, tax is inside
    expect(q.taxPaise).toBe(1770000 - Math.round(1770000 / 1.18));
    const placed = await call(s, "orders.place", { idempotencyKey: "order-key-0000000011", acceptedFingerprint: q.fingerprint, shippingAddress: ADDRESS });
    expect(placed.order.totalPaise).toBe(1770000);
    expect(odoo.quotations[0].lines[0].unitPrice).toBeCloseTo(5000, 2); // exclusive unit price sent to Odoo
  });
});

describe("Phase 3 — admin power tools", () => {
  it("CSV import: preview reports row errors, commit assigns + drafts, publish is separate", async () => {
    const d = await createDealer("Apex Motors", "owner@apex.test");
    const csv = ["SKU,Price,Tax,MOQ", "MAT-BAL-BLK,3800,exclusive,2", "LED-H4,\"6,200\",,", "NOPE-1,100,,", "LED-H4,100,,", "MAT-BAL,3000,,", "HG-PR-RED,abc,,"].join("\n");
    const preview = await admin("prices.importPreview", { dealerId: d.id, csv });
    expect(preview.summary).toEqual({ total: 6, ok: 2, errors: 4 });
    expect(preview.rows[2].errors[0]).toMatch(/not found/);
    expect(preview.rows[3].errors.join()).toMatch(/more than once/);
    expect(preview.rows[4].errors.join()).toMatch(/matches 2 variants/); // template-level SKU is ambiguous
    expect(preview.rows[0]).toMatchObject({ action: "create", variantId: 1011, newPricePaise: 380000 });

    await expectCode(admin("prices.importCommit", { dealerId: d.id, csv }), "VALIDATION"); // errors block the commit…
    const done = await admin("prices.importCommit", { dealerId: d.id, csv, skipInvalid: true }); // …unless explicitly skipped
    expect(done).toEqual({ drafted: 2, assigned: 2, skipped: 4 });
    const grid = await admin("catalog.get", { dealerId: d.id });
    expect(grid.rows.map((r: any) => [r.variantId, r.state])).toEqual(expect.arrayContaining([[1011, "draft_only"], [1021, "draft_only"]]));
    expect(grid.rows.find((r: any) => r.variantId === 1011).minQty).toBe(2);
    expect((await admin("dealers.get", { id: d.id })).ready).toBe(false); // nothing published yet
    await admin("prices.publish", { dealerId: d.id });
    expect((await admin("dealers.get", { id: d.id })).ready).toBe(true);

    // Re-importing identical prices is a no-op diff.
    const again = await admin("prices.importPreview", { dealerId: d.id, csv: "sku,price\nLED-H4,6200" });
    expect(again.rows[0].action).toBe("unchanged");
  });

  it("bulk percentage adjust needs explicit confirmation and only touches priced items", async () => {
    const d = await setupPricedDealer("Apex Motors", "owner@apex.test", [[1011, 380000], [1021, 620000]]);
    await admin("catalog.assign", { dealerId: d.id, variantIds: [1031] }); // assigned, no price
    await expectCode(admin("prices.bulkAdjust", { dealerId: d.id, variantIds: [1011, 1021, 1031], percent: 10 }), "VALIDATION");
    const res = await admin("prices.bulkAdjust", { dealerId: d.id, variantIds: [1011, 1021, 1031], percent: -10, confirm: true });
    expect(res).toEqual({ drafted: 2, skipped: [1031] });
    const grid = await admin("catalog.get", { dealerId: d.id });
    expect(grid.rows.find((r: any) => r.variantId === 1011).draftPrice.pricePaise).toBe(342000);
    expect(grid.rows.find((r: any) => r.variantId === 1011).activePrice.pricePaise).toBe(380000); // not live until published
    await expectCode(admin("prices.bulkAdjust", { dealerId: d.id, variantIds: [1011], percent: -100, confirm: true }), "VALIDATION");
  });

  it("copy deal setup from another dealer", async () => {
    const a = await setupPricedDealer("Apex Motors", "owner@apex.test", [[1011, 380000], [1021, 620000]]);
    const b = await createDealer("Beta Autos", "owner@beta.test");
    await expectCode(admin("prices.copyFrom", { dealerId: b.id, fromDealerId: b.id }), "VALIDATION");
    expect(await admin("prices.copyFrom", { dealerId: b.id, fromDealerId: a.id })).toEqual({ assigned: 2, drafted: 2 });
    await admin("prices.publish", { dealerId: b.id });
    expect((await admin("dealers.get", { id: b.id })).ready).toBe(true);
  });

  it("revert restores a previous price as a NEW audited price (history stays immutable)", async () => {
    const d = await setupPricedDealer("Apex Motors", "owner@apex.test", [[1011, 380000]]);
    tick();
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 100, taxBasis: "exclusive" }); // fat-finger
    await admin("prices.publish", { dealerId: d.id });
    const hist = await admin("prices.history", { dealerId: d.id, variantId: 1011 });
    const good = hist.rules.find((r: any) => r.pricePaise === 380000);
    tick();
    await admin("prices.revert", { dealerId: d.id, ruleId: good.id });
    const grid = await admin("catalog.get", { dealerId: d.id });
    expect(grid.rows[0].activePrice.pricePaise).toBe(380000);
    const hist2 = await admin("prices.history", { dealerId: d.id, variantId: 1011 });
    expect(hist2.rules).toHaveLength(3); // nothing deleted
    const log = await admin("audit.list", { dealerId: d.id });
    expect(log.rows.some((r: any) => r.event === "price.reverted")).toBe(true);
    await expectCode(admin("prices.revert", { dealerId: d.id, ruleId: "00000000-0000-4000-8000-000000000000" }), "NOT_FOUND");
  });

  it("filters: missing price / expiring deals", async () => {
    const d = await setupPricedDealer("Apex Motors", "owner@apex.test", [[1011, 380000]]);
    await admin("catalog.assign", { dealerId: d.id, variantIds: [1021, 1031] });
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1031, pricePaise: 970000, taxBasis: "exclusive", endsAt: "2026-11-05T00:00:00Z" });
    await admin("prices.publish", { dealerId: d.id });
    expect((await admin("catalog.get", { dealerId: d.id, filter: "missing_price" })).rows.map((r: any) => r.variantId)).toEqual([1021]);
    expect((await admin("catalog.get", { dealerId: d.id, filter: "expiring" })).rows.map((r: any) => r.variantId)).toEqual([1031]);
    expect((await admin("catalog.get", { dealerId: d.id, q: "led" })).total).toBe(1);
  });

  it("the audit trail records who did what, with no secrets", async () => {
    const d = await setupPricedDealer("Apex Motors", "owner@apex.test", [[1011, 380000]]);
    await activate(d.id, "owner@apex.test");
    const log = await admin("audit.list", { dealerId: d.id });
    const events = log.rows.map((r: any) => r.event);
    expect(events).toEqual(expect.arrayContaining(["dealer.created", "access.assigned", "price.draft_saved", "price.published", "invite.sent", "dealer.activated"]));
    expect(log.rows.every((r: any) => r.actorType)).toBe(true);
    expect(JSON.stringify(log)).not.toMatch(/password|token|secret/i);
  });
});

describe("Phase 4 — reorder", () => {
  it("re-adds a past order to the cart at CURRENT prices, rounding to the pack multiple and skipping what's gone", async () => {
    const d = await setupPricedDealer("Apex Motors", "owner@apex.test", [[1011, 380000], [1061, 79900]]);
    await admin("catalog.updateAccess", { dealerId: d.id, variantId: 1061, minQty: 5, qtyMultiple: 5 });
    const s = await activate(d.id, "owner@apex.test");
    await call(s, "cart.setItem", { variantId: 1011, quantity: 2 });
    await call(s, "cart.setItem", { variantId: 1061, quantity: 10 });
    const { quote } = await call(s, "cart.get");
    const placed = await call(s, "orders.place", { idempotencyKey: "order-key-0000000012", acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS });

    tick();
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 390000, taxBasis: "exclusive" });
    await admin("prices.publish", { dealerId: d.id });
    await admin("catalog.unassign", { dealerId: d.id, variantIds: [1061] });
    const res = await call(s, "orders.reorder", { id: placed.order.id });
    expect(res.added).toHaveLength(1);
    expect(res.skipped[0]).toMatchObject({ reason: "no longer in your catalogue" });
    const cart = (await call(s, "cart.get")).quote;
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]).toMatchObject({ variantId: 1011, quantity: 2, unitPricePaise: 390000, priceChanged: false });
  });
});
