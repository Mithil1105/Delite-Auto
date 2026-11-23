// Per-dealer portal address (<slug>.dealers.deliteauto.com): branded public landing data, slug rules,
// uniqueness, and "a dealer's own address only serves that dealer". Same engine + fakes as the other suites.

import { beforeEach, describe, expect, it } from "vitest";
import { createDealerEngine, type AdminActor, type DealerSession } from "./engine.ts";
import { DealerError } from "./errors.ts";
import { FakeAuth, FakeOdoo, MemoryRepo, RecordingNotifier } from "./memory.ts";

const OWNER: AdminActor = { id: "11111111-1111-4111-8111-111111111111", role: "owner" };

let clock: Date;
let repo: MemoryRepo;
let auth: FakeAuth;
let engine: ReturnType<typeof createDealerEngine>;

const admin = <T = any>(action: string, payload: Record<string, unknown> = {}) => engine.callAdmin(OWNER, action, payload) as Promise<T>;
const call = <T = any>(s: DealerSession, action: string, payload: Record<string, unknown> = {}) => engine.callDealer(s, action, payload) as Promise<T>;
const expectCode = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(() => null, (e) => e);
  expect(err, `expected ${code}`).toBeInstanceOf(DealerError);
  expect((err as DealerError).code).toBe(code);
};

beforeEach(() => {
  clock = new Date("2026-11-23T10:00:00.000Z");
  repo = new MemoryRepo(undefined, () => clock);
  auth = new FakeAuth();
  let seed = 0.41;
  engine = createDealerEngine({ repo, odoo: new FakeOdoo(), auth, notifier: new RecordingNotifier(), now: () => clock, random: () => (seed = (seed * 7.3) % 1) });
  repo.state.portalMode = "on";
});

async function dealer(name: string, email: string, slug?: string) {
  const { dealer: d } = await admin("dealers.create", { displayName: name, legalName: `${name} Pvt Ltd`, contactEmail: email, ...(slug ? { portalSlug: slug } : {}) });
  await admin("catalog.assign", { dealerId: d.id, variantIds: [1011] });
  await admin("prices.saveDraft", { dealerId: d.id, variantId: 1011, pricePaise: 400000, taxBasis: "exclusive" });
  await admin("prices.publish", { dealerId: d.id });
  return d as { id: string; portal_slug: string | null };
}
const activate = async (id: string, email: string) => {
  await admin("dealers.invite", { id });
  return engine.resolveSession(auth.users.get(email)!);
};

describe("dealer portal address", () => {
  it("normalises and stores the slug; rejects bad and reserved ones", async () => {
    expect((await dealer("Apex Motors", "a@apex.test", "  Apex-Motors ")).portal_slug).toBe("apex-motors");
    for (const bad of ["a", "-apex", "apex-", "ap ex", "ap_ex", "x".repeat(40)]) await expectCode(admin("dealers.create", { displayName: "X", legalName: "X", contactEmail: "x@x.test", portalSlug: bad }), "VALIDATION");
    for (const reserved of ["www", "admin", "api", "dealers"]) await expectCode(admin("dealers.create", { displayName: "X", legalName: "X", contactEmail: "x@x.test", portalSlug: reserved }), "VALIDATION");
  });

  it("two dealers cannot share an address, on create or update; clearing it is allowed", async () => {
    await dealer("Apex", "a@apex.test", "apex");
    await expectCode(admin("dealers.create", { displayName: "Other", legalName: "Other", contactEmail: "o@o.test", portalSlug: "apex" }), "CONFLICT");
    const b = await dealer("Bolt", "b@bolt.test", "bolt");
    await expectCode(admin("dealers.update", { id: b.id, portalSlug: "apex" }), "CONFLICT");
    expect((await admin("dealers.update", { id: b.id, portalSlug: "bolt-auto" })).dealer.portal_slug).toBe("bolt-auto");
    expect((await admin("dealers.update", { id: b.id, portalSlug: null })).dealer.portal_slug).toBeNull();
  });

  it("publicBrand shows only branding for live dealers and is indistinguishable from 'none' otherwise", async () => {
    const a = await dealer("Apex Motors", "a@apex.test", "apex");
    await admin("dealers.branding", { id: a.id, accentColor: "#0A7F5A", tagline: "Drive better", welcomeText: "Welcome, partners" });
    // draft dealer: no public page yet
    expect(await engine.publicBrand("apex")).toBeNull();
    await admin("dealers.invite", { id: a.id });
    const brand = await engine.publicBrand("APEX");
    expect(brand).toMatchObject({ slug: "apex", displayName: "Apex Motors", accentColor: "#0A7F5A", tagline: "Drive better", welcomeText: "Welcome, partners" });
    expect(Object.keys(brand!).sort()).toEqual(["accentColor", "coverPath", "displayName", "logoPath", "slug", "tagline", "welcomeText"]);
    expect(await engine.publicBrand("nope")).toBeNull();
    expect(await engine.publicBrand("not a slug!")).toBeNull();
    await admin("dealers.setStatus", { id: a.id, status: "suspended" });
    expect(await engine.publicBrand("apex")).toBeNull();
  });

  it("a dealer's own address only serves that dealer", async () => {
    const a = await dealer("Apex", "a@apex.test", "apex");
    const b = await dealer("Bolt", "b@bolt.test", "bolt");
    const sa = await activate(a.id, "a@apex.test");
    const sb = await activate(b.id, "b@bolt.test");
    expect((await call(sa, "me", { portalSlug: "apex" })).dealer.portalSlug).toBe("apex");
    await expectCode(call(sa, "me", { portalSlug: "bolt" }), "FORBIDDEN");
    await expectCode(call(sb, "catalog.list", { portalSlug: "apex" }), "FORBIDDEN");
    // the shared address (no slug) keeps working for everyone
    expect((await call(sb, "me")).dealer.portalSlug).toBe("bolt");
    // the refusal is audited for the dealer's own admins
    const audit = await admin("audit.list", { dealerId: sb.dealer.id });
    expect(audit.rows.some((r: any) => r.event === "security.denied" && r.newValue?.reason === "wrong_portal")).toBe(true);
  });

  it("invite links go to the dealer's own address", async () => {
    const a = await dealer("Apex", "a@apex.test", "apex");
    await admin("dealers.invite", { id: a.id });
    expect(auth.invites.at(-1)).toMatchObject({ portalSlug: "apex" });
  });
});
