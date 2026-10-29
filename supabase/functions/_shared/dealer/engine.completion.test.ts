// End-to-end tests for the completion pass: volume tiers, commercial terms, credit limit, team users,
// real session revocation, rollout flag, dealer-manager scope, auto retry, reconciliation, category
// navigation, offers and insights. Same engine, same in-memory fakes as engine.e2e.test.ts.

import { beforeEach, describe, expect, it } from "vitest";
import { createDealerEngine, type AdminActor, type DealerSession } from "./engine.ts";
import { DealerError } from "./errors.ts";
import { FakeAuth, FakeOdoo, MemoryRepo, RecordingNotifier } from "./memory.ts";

const OWNER: AdminActor = { id: "11111111-1111-4111-8111-111111111111", role: "owner" };
const ADMIN: AdminActor = { id: "33333333-3333-4333-8333-333333333333", role: "admin" };
const MANAGER: AdminActor = { id: "44444444-4444-4444-8444-444444444444", role: "dealer_manager" };
const ADDRESS = { name: "Ravi Shah", phone: "9876543210", line1: "12 MG Road", city: "Ahmedabad", state: "Gujarat", pincode: "380001" };

let clock: Date;
let repo: MemoryRepo;
let odoo: FakeOdoo;
let auth: FakeAuth;
let engine: ReturnType<typeof createDealerEngine>;

const admin = <T = any>(action: string, payload: Record<string, unknown> = {}, actor: AdminActor = OWNER) => engine.callAdmin(actor, action, payload) as Promise<T>;
const call = <T = any>(s: DealerSession, action: string, payload: Record<string, unknown> = {}) => engine.callDealer(s, action, payload) as Promise<T>;
const tick = (ms: number) => (clock = new Date(clock.getTime() + ms));
const expectCode = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(() => null, (e) => e);
  expect(err, `expected ${code}`).toBeInstanceOf(DealerError);
  expect((err as DealerError).code).toBe(code);
  return err as DealerError;
};
const iat = (d: Date) => Math.floor(d.getTime() / 1000);

beforeEach(() => {
  clock = new Date("2026-10-28T10:00:00.000Z");
  repo = new MemoryRepo(undefined, () => clock);
  odoo = new FakeOdoo();
  auth = new FakeAuth();
  let seed = 0.37;
  engine = createDealerEngine({ repo, odoo, auth, notifier: new RecordingNotifier(), now: () => clock, random: () => (seed = (seed * 7.3) % 1) });
  repo.state.portalMode = "on";
  repo.state.admins.push({ id: MANAGER.id, fullName: "Dee Manager", role: "dealer_manager" });
});

async function newDealer(name: string, email: string, products: [number, number][], extra: Record<string, unknown> = {}) {
  const { dealer } = await admin("dealers.create", { displayName: name, legalName: `${name} Pvt Ltd`, contactEmail: email, ...extra });
  await admin("catalog.assign", { dealerId: dealer.id, variantIds: products.map(([v]) => v) });
  for (const [variantId, pricePaise] of products) await admin("prices.saveDraft", { dealerId: dealer.id, variantId, pricePaise, taxBasis: "exclusive" });
  await admin("prices.publish", { dealerId: dealer.id });
  return dealer as { id: string; dealer_code: string };
}
async function activate(dealerId: string, email: string): Promise<DealerSession> {
  await admin("dealers.invite", { id: dealerId });
  return engine.resolveSession(auth.users.get(email)!);
}
async function order(s: DealerSession, variantId: number, quantity: number, key: string, extra: Record<string, unknown> = {}) {
  await call(s, "cart.setItem", { variantId, quantity });
  const { quote } = await call(s, "cart.get");
  return call(s, "orders.place", { idempotencyKey: key, acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS, ...extra });
}

describe("volume tiers (Phase 4)", () => {
  it("prices by quantity: base price below the tier, tier price at or above it", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 400000]]);
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 350000, taxBasis: "exclusive", minQuantity: 10 });
    await admin("prices.publish", { dealerId: d.id });
    const s = await activate(d.id, "a@apex.test");
    const lines = async (qty: number) => (await call(s, "cart.setItem", { variantId: 1011, quantity: qty })).quote.lines[0];
    expect(await lines(3)).toMatchObject({ unitPricePaise: 400000, tierMinQty: 1 });
    expect(await lines(10)).toMatchObject({ unitPricePaise: 350000, tierMinQty: 10 });
    expect(await lines(25)).toMatchObject({ unitPricePaise: 350000, subtotalPaise: 8750000 });
    const product = (await call(s, "catalog.get", { templateId: 101 })).product;
    expect(product.variants[0].tiers).toEqual([{ minQty: 1, pricePaise: 400000 }, { minQty: 10, pricePaise: 350000 }]);
  });

  it("publishing a tier never expires the base price; overlap is rejected only WITHIN a tier", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 400000]]);
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 350000, taxBasis: "exclusive", minQuantity: 10 });
    expect(await admin("prices.publish", { dealerId: d.id })).toMatchObject({ published: 1, expired: 0 });
    const hist = await admin("prices.history", { dealerId: d.id, variantId: 1011 });
    expect(hist.rules.filter((r: any) => r.status === "active").map((r: any) => r.minQty).sort()).toEqual([1, 10]);
    tick(1000);
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 340000, taxBasis: "exclusive", minQuantity: 10 });
    expect(await admin("prices.publish", { dealerId: d.id })).toMatchObject({ published: 1, expired: 1 }); // replaces the SAME tier only
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 300000, taxBasis: "exclusive", minQuantity: 10, startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-12-31T00:00:00Z" });
    await expectCode(admin("prices.publish", { dealerId: d.id }), "CONFLICT");
  });

  it("a tier can be removed without touching the base price; bad tier quantities are rejected", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 400000]]);
    await expectCode(admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 1000, taxBasis: "exclusive", minQuantity: 0 }), "VALIDATION");
    await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 350000, taxBasis: "exclusive", minQuantity: 10 });
    await admin("prices.publish", { dealerId: d.id });
    const tier = (await admin("prices.history", { dealerId: d.id, variantId: 1011 })).rules.find((r: any) => r.minQty === 10);
    await admin("prices.removeTier", { dealerId: d.id, ruleId: tier.id });
    const s = await activate(d.id, "a@apex.test");
    expect((await call(s, "cart.setItem", { variantId: 1011, quantity: 12 })).quote.lines[0].unitPricePaise).toBe(400000);
  });

  it("CSV imports a tier column; bulk % adjusts every tier; copy brings every tier", async () => {
    const a = await newDealer("Apex", "a@apex.test", [[1011, 400000]]);
    const csv = "sku,price,tier\nMAT-BAL-BLK,3500,10\nMAT-BAL-BLK,3500,10";
    const preview = await admin("prices.importPreview", { dealerId: a.id, csv });
    expect(preview.rows[1].errors.join()).toMatch(/more than once/);
    await admin("prices.importCommit", { dealerId: a.id, csv: "sku,price,tier\nMAT-BAL-BLK,3500,10", skipInvalid: false });
    await admin("prices.publish", { dealerId: a.id });
    await admin("prices.bulkAdjust", { dealerId: a.id, variantIds: [1011], percent: -10, confirm: true });
    await admin("prices.publish", { dealerId: a.id });
    const tiers = (await admin("prices.history", { dealerId: a.id, variantId: 1011 })).rules.filter((r: any) => r.status === "active");
    expect(tiers.map((r: any) => [r.minQty, r.pricePaise]).sort()).toEqual([[1, 360000], [10, 315000]]);
    const b = (await admin("dealers.create", { displayName: "Beta", legalName: "Beta Ltd", contactEmail: "b@beta.test" })).dealer;
    await admin("prices.copyFrom", { dealerId: b.id, fromDealerId: a.id });
    await admin("prices.publish", { dealerId: b.id });
    const copied = (await admin("prices.history", { dealerId: b.id, variantId: 1011 })).rules.filter((r: any) => r.status === "active");
    expect(copied.map((r: any) => r.minQty).sort()).toEqual([1, 10]);
  });

  it("apply-to-variants copies one variant's price to its siblings as drafts (product-level price)", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 380000]]);
    await admin("catalog.assign", { dealerId: d.id, variantIds: [1012] });
    expect(await admin("prices.applyToVariants", { dealerId: d.id, variantId: 1011 })).toEqual({ drafted: 1 });
    await admin("prices.publish", { dealerId: d.id });
    expect((await admin("catalog.get", { dealerId: d.id })).rows.every((r: any) => r.state === "ok")).toBe(true);
    await expectCode(admin("prices.applyToVariants", { dealerId: d.id, variantId: 1021 }), "NOT_FOUND");
  });
});

describe("commercial terms: PO method, shipping, payment terms, credit limit", () => {
  it("a PO-required dealer cannot order without a PO reference", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 380000]], { purchaseMethod: "po_required" });
    const s = await activate(d.id, "a@apex.test");
    await expectCode(order(s, 1011, 1, "key-po-aaaaaaaaaaaa1"), "VALIDATION");
    expect((await order(s, 1011, 1, "key-po-aaaaaaaaaaaa2", { poReference: "PO-9" })).order.poReference).toBe("PO-9");
  });

  it("shipping policy: flat adds to the quote, total and the fingerprint; terms reach the Odoo note", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 380000]], { shippingPolicy: "flat", flatShippingPaise: 50000, paymentTerms: "Net 30" });
    const s = await activate(d.id, "a@apex.test");
    const q = (await call(s, "cart.setItem", { variantId: 1011, quantity: 1 })).quote;
    expect(q).toMatchObject({ shippingPaise: 50000, shippingLabel: "Flat rate", paymentTerms: "Net 30", totalPaise: 380000 + 68400 + 50000 });
    const placed = await call(s, "orders.place", { idempotencyKey: "key-ship-aaaaaaaaaa", acceptedFingerprint: q.fingerprint, shippingAddress: ADDRESS });
    expect(placed.order.shippingPaise).toBe(50000);
    await expectCode(admin("dealers.update", { id: d.id, shippingPolicy: "flat", flatShippingPaise: 0 }), "VALIDATION");
  });

  it("credit limit counts open orders and blocks the order that would exceed it", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 380000]], { creditLimitPaise: 1_000_000 });
    const s = await activate(d.id, "a@apex.test");
    await order(s, 1011, 2, "key-credit-aaaaaaaa1"); // 2 x 3,800 + 18% = ₹8,968
    expect((await call(s, "me")).credit).toEqual({ limitPaise: 1_000_000, usedPaise: 896800, availablePaise: 103200 });
    await call(s, "cart.setItem", { variantId: 1011, quantity: 2 });
    const { quote } = await call(s, "cart.get");
    expect(quote.credit.wouldExceed).toBe(true);
    const err = await expectCode(call(s, "orders.place", { idempotencyKey: "key-credit-aaaaaaaa2", acceptedFingerprint: quote.fingerprint, shippingAddress: ADDRESS }), "CREDIT_LIMIT");
    expect((err.details as any).limitPaise).toBe(1_000_000);
    expect(repo.state.orders).toHaveLength(1);
  });

  it("out-of-stock only blocks when the store actually tracks inventory", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 380000]]);
    const s = await activate(d.id, "a@apex.test");
    await call(s, "cart.setItem", { variantId: 1011, quantity: 1 });
    expect((await call(s, "cart.get")).quote.canOrder).toBe(true); // untracked store: stock ignored
    odoo.inventoryTracked = true;
    const q = (await call(s, "cart.get")).quote;
    expect(q.canOrder).toBe(false);
    expect(q.lines[0].issues).toContain("out_of_stock");
    expect((await call(s, "catalog.get", { templateId: 101 })).product.variants[0].unavailableReason).toBe("out_of_stock");
    await expectCode(call(s, "cart.setItem", { variantId: 1011, quantity: 2 }), "VALIDATION");
    odoo.stock.set(1011, 5);
    expect((await call(s, "cart.get")).quote.canOrder).toBe(true);
  });
});

describe("team users and sessions", () => {
  async function teamDealer() {
    const d = await newDealer("Apex", "owner@apex.test", [[1011, 380000]]);
    const owner = await activate(d.id, "owner@apex.test");
    return { d, owner };
  }

  it("admin adds a buyer: buyers can order but cannot manage the account or the team", async () => {
    const { d } = await teamDealer();
    await admin("dealers.addUser", { id: d.id, email: "buyer@apex.test" });
    const buyer = await engine.resolveSession(auth.users.get("buyer@apex.test")!);
    expect(buyer.user.role).toBe("buyer");
    expect((await order(buyer, 1011, 1, "key-buyer-aaaaaaaaa1")).order.orderNumber).toMatch(/^DLR-/);
    await expectCode(call(buyer, "account.update", { contactName: "x" }), "FORBIDDEN");
    await expectCode(call(buyer, "team.invite", { email: "x@apex.test" }), "FORBIDDEN");
    expect((await call(buyer, "team.list")).canManage).toBe(false);
  });

  it("the owner invites and disables buyers; a disabled buyer is locked out at once; the only owner is protected", async () => {
    const { d, owner } = await teamDealer();
    const inv = await call(owner, "team.invite", { email: "staff@apex.test" });
    await expectCode(call(owner, "team.invite", { email: "staff@apex.test" }), "CONFLICT");
    const staff = await engine.resolveSession(auth.users.get("staff@apex.test")!);
    await call(owner, "team.setStatus", { userId: inv.user.id, status: "disabled" });
    expect(auth.revoked.flat()).toContain(auth.users.get("staff@apex.test"));
    await expectCode(engine.resolveSession(auth.users.get("staff@apex.test")!), "FORBIDDEN");
    await call(owner, "team.setStatus", { userId: inv.user.id, status: "active" });
    expect((await engine.resolveSession(auth.users.get("staff@apex.test")!)).user.role).toBe("buyer");
    await expectCode(call(owner, "team.setStatus", { userId: owner.user.id, status: "disabled" }), "CONFLICT");
    await expectCode(call(staff, "team.invite", { email: "z@apex.test" }), "FORBIDDEN");
    const ownerRow = (await admin("dealers.get", { id: d.id })).users.find((u: any) => u.role === "owner");
    await expectCode(admin("dealers.setUserStatus", { id: d.id, userId: ownerRow.id, status: "disabled" }), "CONFLICT");
  });

  it("team size is capped and a draft/archived dealer cannot get team members", async () => {
    const draft = (await admin("dealers.create", { displayName: "Draft", legalName: "Draft Ltd", contactEmail: "d@d.test" })).dealer;
    await expectCode(admin("dealers.addUser", { id: draft.id, email: "x@d.test" }), "CONFLICT");
    const { d } = await teamDealer();
    for (let i = 0; i < 9; i++) await admin("dealers.addUser", { id: d.id, email: `u${i}@apex.test` });
    await expectCode(admin("dealers.addUser", { id: d.id, email: "overflow@apex.test" }), "VALIDATION");
  });

  it("revoke sessions: tokens issued before the revoke are refused, newer ones work; suspension revokes too", async () => {
    const { d } = await teamDealer();
    const authId = auth.users.get("owner@apex.test")!;
    const before = iat(clock);
    tick(60_000);
    expect(await admin("dealers.revokeSessions", { id: d.id })).toEqual({ revoked: 1 });
    expect(auth.revoked.at(-1)).toEqual([authId]);
    await expectCode(engine.resolveSession(authId, "r", before), "UNAUTHENTICATED");
    tick(1000);
    await engine.resolveSession(authId, "r", iat(clock));
    auth.revoked.length = 0;
    await admin("dealers.setStatus", { id: d.id, status: "suspended" });
    expect(auth.revoked.flat()).toEqual([authId]);
    await admin("dealers.setStatus", { id: d.id, status: "active" });
    tick(1000);
    await expectCode(engine.resolveSession(authId, "r", iat(clock) - 5), "UNAUTHENTICATED"); // old login can't be reused after reactivation
  });

  it("admin can send a single-use password reset to a dealer user", async () => {
    const { d } = await teamDealer();
    const user = (await admin("dealers.get", { id: d.id })).users[0];
    expect(await admin("dealers.sendReset", { id: d.id, userId: user.id })).toEqual({ sent: true });
    expect(auth.resets).toEqual(["owner@apex.test"]);
  });
});

describe("rollout flag (spec §12)", () => {
  it("off blocks everyone, pilot admits only pilot dealers, on admits all; only owners change it", async () => {
    const pilot = await newDealer("Pilot Co", "p@pilot.test", [[1011, 380000]], { isPilot: true });
    const other = await newDealer("Other Co", "o@other.test", [[1011, 400000]]);
    await admin("dealers.invite", { id: pilot.id });
    await admin("dealers.invite", { id: other.id });
    await admin("portal.setMode", { mode: "pilot" });
    await engine.resolveSession(auth.users.get("p@pilot.test")!);
    await expectCode(engine.resolveSession(auth.users.get("o@other.test")!), "DEALER_INACTIVE");
    await admin("portal.setMode", { mode: "off" });
    await expectCode(engine.resolveSession(auth.users.get("p@pilot.test")!), "DEALER_INACTIVE");
    await admin("portal.setMode", { mode: "on" });
    await engine.resolveSession(auth.users.get("o@other.test")!);
    await expectCode(admin("portal.setMode", { mode: "on" }, ADMIN), "FORBIDDEN");
    await expectCode(admin("portal.setMode", { mode: "everyone" }), "VALIDATION");
    expect((await admin("portal.getMode", {}, ADMIN)).mode).toBe("on");
  });
});

describe("dealer_manager role: scoped, pricing only by explicit grant (spec §2)", () => {
  it("has no power until granted; sees only granted dealers; hidden dealers look non-existent", async () => {
    const a = await newDealer("Alpha", "a@alpha.test", [[1011, 380000]]);
    const b = await newDealer("Beta", "b@beta.test", [[1021, 620000]]);
    await expectCode(admin("dealers.list", {}, MANAGER), "FORBIDDEN");
    await admin("roles.setGrant", { userId: MANAGER.id, dealerIds: [a.id], canManagePricing: false });
    const list = await admin("dealers.list", {}, MANAGER);
    expect(list.rows.map((r: any) => r.displayName)).toEqual(["Alpha"]);
    expect((await admin("dealers.get", { id: a.id }, MANAGER)).dealer.display_name).toBe("Alpha");
    await expectCode(admin("dealers.get", { id: b.id }, MANAGER), "NOT_FOUND");
    await expectCode(admin("catalog.get", { dealerId: b.id }, MANAGER), "NOT_FOUND");
    await expectCode(admin("orders.list", { dealerId: b.id }, MANAGER), "NOT_FOUND");
    await expectCode(admin("dealers.create", { displayName: "N", legalName: "N", contactEmail: "n@n.test" }, MANAGER), "FORBIDDEN");
    const bulk = await admin("dealers.bulkSuspend", { ids: [a.id, b.id], confirm: true }, MANAGER);
    expect(bulk.skipped).toContain(b.id); // out of scope: skipped, never suspended
    expect((await admin("dealers.get", { id: b.id })).dealer.status).toBe("draft");
  });

  it("pricing needs the explicit grant, and then applies only to the granted dealers", async () => {
    const a = await newDealer("Alpha", "a@alpha.test", [[1011, 380000]]);
    const b = await newDealer("Beta", "b@beta.test", [[1011, 400000]]);
    await admin("roles.setGrant", { userId: MANAGER.id, dealerIds: [a.id], canManagePricing: false });
    await expectCode(admin("prices.saveDraft", { dealerId: a.id, variantId: 1011, pricePaise: 370000, taxBasis: "exclusive" }, MANAGER), "FORBIDDEN");
    await admin("roles.setGrant", { userId: MANAGER.id, dealerIds: [a.id], canManagePricing: true });
    await admin("prices.saveDraft", { dealerId: a.id, variantId: 1011, pricePaise: 370000, taxBasis: "exclusive" }, MANAGER);
    await admin("prices.publish", { dealerId: a.id }, MANAGER);
    await expectCode(admin("prices.saveDraft", { dealerId: b.id, variantId: 1011, pricePaise: 1000, taxBasis: "exclusive" }, MANAGER), "NOT_FOUND");
    await expectCode(admin("prices.copyFrom", { dealerId: a.id, fromDealerId: b.id }, MANAGER), "NOT_FOUND");
    await expectCode(admin("portal.setMode", { mode: "off" }, MANAGER), "FORBIDDEN");
    await expectCode(admin("roles.setGrant", { userId: MANAGER.id, canManagePricing: true }, MANAGER), "FORBIDDEN");
  });

  it("an all-dealers grant works; grants can only target dealer_manager accounts", async () => {
    await newDealer("Alpha", "a@alpha.test", [[1011, 380000]]);
    await newDealer("Beta", "b@beta.test", [[1011, 380000]]);
    await admin("roles.setGrant", { userId: MANAGER.id, dealerIds: null, canManagePricing: false });
    expect((await admin("dealers.list", {}, MANAGER)).total).toBe(2);
    await expectCode(admin("roles.setGrant", { userId: "55555555-5555-4555-8555-555555555555", canManagePricing: true }), "VALIDATION");
    expect((await admin("roles.listManagers", {})).managers).toEqual([{ userId: MANAGER.id, name: "Dee Manager", dealerIds: null, hasGrant: true, canManagePricing: false }]);
  });
});

describe("automatic retry and reconciliation (spec §11)", () => {
  async function pendingOrder() {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 380000]]);
    const s = await activate(d.id, "a@apex.test");
    const real = odoo.createQuotation.bind(odoo);
    odoo.createQuotation = async () => {
      throw new Error("Odoo request failed: HTTP 503");
    };
    const res = await order(s, 1011, 1, "key-retry-aaaaaaaaa1");
    odoo.createQuotation = real;
    return { d, s, res };
  }

  it("a stuck order is retried automatically with backoff, and never before its wait is over", async () => {
    const { s, res } = await pendingOrder();
    expect(res.order.status).toBe("pending_sync");
    await call(s, "orders.list");
    expect(odoo.quotations).toHaveLength(0); // still inside the 1-minute backoff
    tick(61_000);
    await call(s, "orders.list");
    expect(odoo.quotations).toHaveLength(1);
    expect(repo.state.orders[0].status).toBe("quotation");
    tick(10 * 60_000);
    await call(s, "orders.list");
    expect(odoo.quotations).toHaveLength(1); // nothing left to retry, no duplicate quotation
  });

  it("the admin orders list also drives the retry, scoped to the actor's dealers", async () => {
    const { d } = await pendingOrder();
    tick(61_000);
    await admin("roles.setGrant", { userId: MANAGER.id, dealerIds: [], canManagePricing: false });
    await admin("orders.list", {}, MANAGER);
    expect(odoo.quotations).toHaveLength(0); // an unrelated manager's listing must not touch this dealer
    await admin("orders.list", { dealerId: d.id });
    expect(odoo.quotations).toHaveLength(1);
  });

  it("reconciliation reports stale pending orders, status drift, amount drift and missing Odoo orders", async () => {
    const { d, s } = await pendingOrder();
    tick(20 * 60_000);
    let report = await admin("orders.reconcile");
    expect(report.issues.map((i: any) => i.kind)).toEqual(["pending_too_long"]);
    await admin("orders.retrySync", { id: repo.state.orders[0].id });
    expect((await admin("orders.reconcile")).issues).toEqual([]);

    odoo.quotations[0].state = "sale"; // confirmed in Odoo, portal not yet refreshed
    odoo.quotations[0].amountTotal += 50; // and the total drifted
    report = await admin("orders.reconcile");
    expect(report.issues.map((i: any) => i.kind).sort()).toEqual(["amount_mismatch", "status_mismatch"]);

    odoo.quotations.length = 0; // deleted in Odoo
    expect((await admin("orders.reconcile")).issues.map((i: any) => i.kind)).toEqual(["missing_in_odoo"]);
    odoo.down = true;
    expect((await admin("orders.reconcile")).odooReachable).toBe(false);
    odoo.down = false;
    void d;
    void s;
  });
});

describe("category navigation, unassigned view, offers, insights, security summary", () => {
  it("categories and the category filter only ever cover the dealer's own assigned products", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 380000], [1061, 61000], [1071, 40000]]);
    const s = await activate(d.id, "a@apex.test");
    const cats = (await call(s, "catalog.categories")).categories;
    expect(cats.map((c: any) => [c.name, c.count])).toEqual([["Car Care", 2], ["Car Mats", 1]]);
    expect(cats.some((c: any) => c.name === "Seat Covers")).toBe(false); // exists in Odoo, not assigned
    const carCare = cats.find((c: any) => c.name === "Car Care").id;
    const filtered = await call(s, "catalog.list", { categoryId: carCare });
    expect(filtered.items.map((p: any) => p.name).sort()).toEqual(["Alloy Wheel Cleaner 1L", "Microfibre Cleaning Kit"]);
    const seat = (await admin("catalog.searchMaster", { dealerId: d.id, q: "seat" })).items[0];
    expect(seat.name).toMatch(/Seat Cover/);
    expect((await call(s, "catalog.list", { categoryId: 9999 })).items).toEqual([]);
  });

  it("the Unassigned view lists only products with nothing assigned yet", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 380000]]);
    const all = (await admin("catalog.searchMaster", { dealerId: d.id })).items.map((i: any) => i.templateId);
    const unassigned = (await admin("catalog.searchMaster", { dealerId: d.id, unassignedOnly: true })).items.map((i: any) => i.templateId);
    expect(all).toContain(101);
    expect(unassigned).not.toContain(101);
    expect(unassigned.length).toBe(all.length - 1);
  });

  it("offers show on the dealer dashboard only inside their window and stop when deleted", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 380000]]);
    const s = await activate(d.id, "a@apex.test");
    const { offer } = await admin("offers.save", { dealerId: d.id, title: "Diwali deal", body: "Extra 2% on mats", endsAt: "2026-11-05T00:00:00Z" });
    await admin("offers.save", { dealerId: d.id, title: "Future", startsAt: "2027-01-01T00:00:00Z" });
    await expectCode(admin("offers.save", { dealerId: d.id, title: "Bad", startsAt: "2026-05-01T00:00:00Z", endsAt: "2026-04-01T00:00:00Z" }), "VALIDATION");
    expect((await call(s, "me")).offers.map((o: any) => o.title)).toEqual(["Diwali deal"]);
    tick(10 * 24 * 3600_000);
    expect((await call(s, "me")).offers).toEqual([]);
    await admin("offers.delete", { dealerId: d.id, offerId: offer.id });
    expect((await admin("offers.list", { dealerId: d.id })).offers.map((o: any) => o.title)).toEqual(["Future"]);
  });

  it("insights summarise spend, monthly trend and top products from order snapshots", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 380000], [1021, 620000]]);
    const s = await activate(d.id, "a@apex.test");
    await order(s, 1011, 2, "key-ins-aaaaaaaaaaa1");
    tick(40 * 24 * 3600_000);
    await order(s, 1021, 1, "key-ins-aaaaaaaaaaa2");
    const ins = await call(s, "insights", { days: 90 });
    expect(ins).toMatchObject({ orders: 2, spendPaise: 896800 + 731600, averageOrderPaise: Math.round((896800 + 731600) / 2) });
    expect(ins.monthly.map((m: any) => m.month)).toEqual(["2026-10", "2026-12"]);
    expect(ins.topProducts[0]).toMatchObject({ name: "Maruti Baleno Floor Mats (Black)", qty: 2 });
    expect((await call(s, "insights", { days: 7 })).orders).toBe(1);
  });

  it("failed access attempts raise an admin alert; cross-tenant probes always do", async () => {
    await newDealer("Apex", "a@apex.test", [[1011, 380000]]);
    expect((await admin("security.summary", {}, ADMIN)).alert).toBe(false);
    for (let i = 0; i < 5; i++) await expectCode(engine.resolveSession("99999999-9999-4999-8999-999999999999"), "FORBIDDEN");
    expect(await admin("security.summary", {}, ADMIN)).toMatchObject({ denied: 5, alert: true });
  });

  it("dealer detail exposes the commercial terms and user roles to admins", async () => {
    const d = await newDealer("Apex", "a@apex.test", [[1011, 380000]], { paymentTerms: "Net 15", creditLimitPaise: 5_000_000, isPilot: true });
    await activate(d.id, "a@apex.test");
    const detail = await admin("dealers.get", { id: d.id });
    expect(detail.terms).toEqual({ purchaseMethod: "request_order", shippingPolicy: "as_agreed", flatShippingPaise: 0, paymentTerms: "Net 15", creditLimitPaise: 5_000_000, isPilot: true });
    expect(detail.users[0]).toMatchObject({ role: "owner", status: "active" });
    const sorted = await admin("dealers.list", { sortBy: "name", sortDir: "asc" });
    expect(sorted.rows[0].displayName).toBe("Apex");
  });
});
