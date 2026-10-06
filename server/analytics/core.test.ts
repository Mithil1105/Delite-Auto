import { describe, expect, it } from "vitest";
import {
  EVENT_NAMES, LIMITS, classifySource, clampTimestamp, normalizeQuery, pageTypeFor, parseUserAgent, sanitizePath, validateBatch,
} from "../../supabase/functions/_shared/analytics/core";

const NOW = Date.parse("2026-09-21T10:00:00.000Z");
const S = "11111111-1111-4111-8111-111111111111";
const V = "22222222-2222-4222-8222-222222222222";
const uuid = (n: number) => `33333333-3333-4333-8333-${String(n).padStart(12, "0")}`;
const session = { id: S, visitor_id: V, landing_path: "/", referrer_domain: "www.google.com", utm_source: "insta" };
const ev = (n: number, extra: Record<string, unknown>) => ({ id: uuid(n), occurred_at: new Date(NOW).toISOString(), ...extra });
const ok = (input: unknown) => {
  const r = validateBatch(input, NOW);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.batch;
};
const bad = (input: unknown) => {
  const r = validateBatch(input, NOW);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error;
};

describe("ingestion: accepted journey events", () => {
  it("anonymous page view (page views are a first-class batch member, with derived page type)", () => {
    const b = ok({ session, page_views: [{ id: uuid(1), path: "/shop", started_at: new Date(NOW).toISOString() }] });
    expect(b.page_views[0].page_type).toBe("shop");
    expect(b.events).toHaveLength(0);
  });

  it("authenticated page view: a browser-supplied user_id is ignored entirely", () => {
    const b = ok({ session: { ...session, user_id: "99999999-9999-4999-8999-999999999999" }, page_views: [{ id: uuid(1), path: "/" }] });
    expect(JSON.stringify(b)).not.toContain("99999999");
    expect("user_id" in b.session).toBe(false);
  });

  it("product view, search, add, remove, quantity, checkout, recommendation events all validate", () => {
    const b = ok({
      session,
      events: [
        ev(1, { event_name: "product_view", odoo_template_id: 442, odoo_variant_id: 9 }),
        ev(2, { event_name: "search_submitted", search_query: "  Seat   COVER ", result_count: 12 }),
        ev(3, { event_name: "search_result_click", search_query: "seat cover", odoo_template_id: 442, duration_ms: 4200 }),
        ev(4, { event_name: "add_to_cart", odoo_template_id: 442, quantity: 2, value: 4998, cart_id: uuid(50) }),
        ev(5, { event_name: "remove_from_cart", odoo_template_id: 442, quantity: 2 }),
        ev(6, { event_name: "cart_quantity_changed", odoo_template_id: 442, quantity: 0 }),
        ev(7, { event_name: "checkout_started", value: 4998, cart_id: uuid(50) }),
        ev(8, { event_name: "checkout_step_viewed", metadata: { step: "details" } }),
        ev(9, { event_name: "recommendation_impression", odoo_template_id: 508, surface: "pdp_recommendation", strategy: "same_category" }),
        ev(10, { event_name: "recommendation_click", odoo_template_id: 508, surface: "pdp_recommendation", strategy: "same_category" }),
        ev(11, { event_name: "recommendation_add_to_cart", odoo_template_id: 508, surface: "cart_recommendation", strategy: "complement" }),
      ],
      cart: { id: uuid(50), items: [{ odoo_template_id: 442, odoo_variant_id: 9, quantity: 2, observed_unit_price: 2499 }] },
    });
    expect(b.events).toHaveLength(11);
    expect(b.events[1].search_query).toBe("Seat COVER");
    expect(b.events[1].search_query_norm).toBe("seat cover");
    expect(b.cart?.items[0].observed_unit_price).toBe(2499);
  });

  it("covers the remaining taxonomy (navigation / promotion / category / brand / wishlist / contact)", () => {
    const b = ok({
      session,
      events: [
        ev(1, { event_name: "navigation_click", surface: "nav_cars", metadata: { target: "/shop?vehicle=car" } }),
        ev(2, { event_name: "promotion_click", surface: "home_promo", metadata: { promotion_id: "abc", label: "Combo" } }),
        ev(3, { event_name: "category_view", category_id: 12 }),
        ev(4, { event_name: "brand_view", brand_id: 25 }),
        ev(5, { event_name: "wishlist_add", odoo_template_id: 8, surface: "product_card" }),
        ev(6, { event_name: "contact_started" }),
        ev(7, { event_name: "contact_submitted" }),
      ],
    });
    expect(b.events[0].metadata.target).toBe("/shop");       // query string stripped from the target
    expect(EVENT_NAMES).toContain("contact_submitted");
  });
});

describe("ingestion: rejections", () => {
  it("rejects purchase from a browser (server-owned)", () => {
    expect(bad({ session, events: [ev(1, { event_name: "purchase", value: 99999 })] })).toMatch(/server only/);
  });

  it("rejects unknown event names", () => {
    expect(bad({ session, events: [ev(1, { event_name: "click_anything" })] })).toMatch(/unknown event_name/);
  });

  it("rejects fields outside an event's schema — including a spoofed user_id on an event", () => {
    expect(bad({ session, events: [ev(1, { event_name: "product_view", odoo_template_id: 1, user_id: V })] })).toMatch(/field not allowed/);
    expect(bad({ session, events: [ev(1, { event_name: "product_view", odoo_template_id: 1, value: 5 })] })).toMatch(/field not allowed/);
  });

  it("rejects missing required fields and invalid numbers", () => {
    expect(bad({ session, events: [ev(1, { event_name: "add_to_cart", odoo_template_id: 1, quantity: 1 })] })).toMatch(/missing/);
    expect(bad({ session, events: [ev(1, { event_name: "add_to_cart", odoo_template_id: 1, quantity: 0, value: 5 })] })).toMatch(/missing|invalid/);
    expect(bad({ session, events: [ev(1, { event_name: "add_to_cart", odoo_template_id: 1.5, quantity: 1, value: 5 })] })).toMatch(/missing/);
    expect(bad({ session, events: [ev(1, { event_name: "add_to_cart", odoo_template_id: 1, quantity: 1, value: -5 })] })).toMatch(/missing/);
    expect(bad({ session, events: [ev(1, { event_name: "add_to_cart", odoo_template_id: 1, quantity: 1, value: 1e12 })] })).toMatch(/missing/);
  });

  it("rejects oversized metadata and disallowed checkout steps", () => {
    expect(bad({ session, events: [ev(1, { event_name: "navigation_click", surface: "x", metadata: { target: "/shop", junk: "x".repeat(2000) } })] })).toMatch(/metadata/);
    expect(bad({ session, events: [ev(1, { event_name: "checkout_step_viewed", metadata: { step: "<script>" } })] })).toMatch(/meta\.step/);
  });

  it("drops (does not store) unknown metadata keys and free-form values", () => {
    const b = ok({ session, events: [ev(1, { event_name: "navigation_click", surface: "nav_cars", metadata: { target: "/shop", password: "hunter2" } })] });
    expect(JSON.stringify(b.events[0].metadata)).not.toContain("hunter2");
  });

  it("rejects malformed identifiers and structure", () => {
    expect(bad({ session: { ...session, id: "not-a-uuid" } })).toMatch(/invalid session/);
    expect(bad({ session, events: [ev(1, { event_name: "product_view", odoo_template_id: 1, id: "nope" })] })).toMatch(/invalid event id/);
    expect(bad({ session, events: "x" })).toMatch(/array/);
    expect(bad(null)).toMatch(/object/);
  });

  it("enforces batch-size limits", () => {
    const many = Array.from({ length: LIMITS.events + 1 }, (_, i) => ev(i + 1, { event_name: "cart_viewed" }));
    expect(bad({ session, events: many })).toMatch(/too many/);
    const items = Array.from({ length: LIMITS.cartItems + 1 }, (_, i) => ({ odoo_template_id: i + 1, quantity: 1, observed_unit_price: 1 }));
    expect(bad({ session, cart: { id: uuid(9), items } })).toMatch(/too many/);
  });
});

describe("ingestion: lenient mode (what the Edge Function uses)", () => {
  it("skips an individually-invalid event but keeps the rest of the batch", () => {
    const r = validateBatch({ session, events: [
      ev(1, { event_name: "product_view", odoo_template_id: 442 }),
      ev(2, { event_name: "search_submitted", search_query: "me@example.com", result_count: 0 }),   // untrackable (looks like an e-mail)
      ev(3, { event_name: "add_to_cart", odoo_template_id: 442, quantity: 1, value: 10 }),
    ] }, NOW, true);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.batch.events.map((e) => e.event_name)).toEqual(["product_view", "add_to_cart"]); expect(r.batch.rejected).toHaveLength(1); }
  });

  it("still hard-fails an attempted purchase and structural errors", () => {
    expect(validateBatch({ session, events: [ev(1, { event_name: "purchase", value: 1 })] }, NOW, true).ok).toBe(false);
    expect(validateBatch({ session: { id: "x" } }, NOW, true).ok).toBe(false);
  });
});

describe("privacy: URLs, queries and timestamps", () => {
  it("never keeps query strings or fragments and collapses order ids", () => {
    expect(sanitizePath("/shop?token=abc&utm_source=x")).toBe("/shop");
    expect(sanitizePath("/reset?access_token=SECRET#frag")).toBe("/other");
    expect(sanitizePath("/order/8f2c-real-order-id")).toBe("/order/:id");
    expect(sanitizePath("/product/seat-cover--442?ref=x")).toBe("/product/seat-cover--442");
    expect(sanitizePath("/admin/analytics")).toBeNull();
    expect(sanitizePath("javascript:alert(1)")).toBeNull();
  });

  it("classifies page types", () => {
    expect(pageTypeFor("/")).toBe("home");
    expect(pageTypeFor("/product/x-1")).toBe("product");
    expect(pageTypeFor("/order/:id")).toBe("order_confirmation");
    expect(pageTypeFor("/terms")).toBe("legal");
    expect(pageTypeFor("/other")).toBe("other");
  });

  it("normalises search text and refuses sensitive-looking input", () => {
    expect(normalizeQuery("  Seat   COVER  ")).toEqual({ display: "Seat COVER", norm: "seat cover" });
    expect(normalizeQuery("me@example.com")).toBeNull();
    expect(normalizeQuery("4111111111111111")).toBeNull();
    expect(normalizeQuery("   ")).toBeNull();
    expect(normalizeQuery("x".repeat(500))?.display).toHaveLength(120);
  });

  it("clamps client timestamps into a plausible window", () => {
    expect(clampTimestamp("2026-09-21T09:59:00.000Z", NOW)).toBe("2026-09-21T09:59:00.000Z");
    expect(clampTimestamp("2030-01-01T00:00:00.000Z", NOW)).toBe(new Date(NOW).toISOString());   // far future
    expect(clampTimestamp("2020-01-01T00:00:00.000Z", NOW)).toBe(new Date(NOW).toISOString());   // ancient
    expect(clampTimestamp("garbage", NOW)).toBe(new Date(NOW).toISOString());
  });

  it("strips unsafe UTM values and referrer queries", () => {
    const b = ok({ session: { ...session, utm_source: "<script>", utm_campaign: "diwali-sale", referrer: "https://x.com/a?token=1" } });
    expect(b.session.utm_source).toBeNull();
    expect(b.session.utm_campaign).toBe("diwali-sale");
    expect(b.session.referrer).toBeNull();               // a full URL (with scheme) is not a valid host+path form
  });
});

describe("user agent parsing and bot detection", () => {
  const chromeWin = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const androidPhone = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
  const androidTablet = "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  it("parses coarse device/browser/OS", () => {
    expect(parseUserAgent(chromeWin)).toMatchObject({ device_type: "desktop", browser_family: "Chrome", os_family: "Windows", is_bot: false });
    expect(parseUserAgent(iphone)).toMatchObject({ device_type: "mobile", browser_family: "Safari", os_family: "iOS" });
    expect(parseUserAgent(androidPhone)).toMatchObject({ device_type: "mobile", os_family: "Android" });
    expect(parseUserAgent(androidTablet)).toMatchObject({ device_type: "tablet", os_family: "Android" });
    expect(parseUserAgent(chromeWin + " Edg/120.0").browser_family).toBe("Edge");
  });

  it("flags crawlers, monitors and headless automation; leaves real browsers alone", () => {
    for (const ua of ["Googlebot/2.1", "UptimeRobot/2.0", "Mozilla/5.0 HeadlessChrome/120", "curl/8.0", "Pingdom.com_bot", "", "Lighthouse"]) {
      expect(parseUserAgent(ua).is_bot).toBe(true);
    }
    expect(parseUserAgent(chromeWin).is_bot).toBe(false);
  });
});

describe("traffic source classification", () => {
  const c = (p: Partial<Parameters<typeof classifySource>[0]>) =>
    classifySource({ referrer_domain: null, utm_source: null, utm_medium: null, utm_campaign: null, selfHosts: ["deliteauto.com"], ...p });

  it("classifies the documented channels", () => {
    expect(c({})).toBe("Direct");
    expect(c({ referrer_domain: "www.google.com" })).toBe("Google Organic");
    expect(c({ referrer_domain: "www.google.com", utm_medium: "cpc" })).toBe("Campaign");
    expect(c({ referrer_domain: "www.bing.com" })).toBe("Search");
    expect(c({ referrer_domain: "l.instagram.com" })).toBe("Instagram");
    expect(c({ utm_source: "facebook", utm_medium: "social" })).toBe("Facebook");
    expect(c({ referrer_domain: "wa.me" })).toBe("WhatsApp");
    expect(c({ utm_source: "newsletter", utm_medium: "email", utm_campaign: "diwali" })).toBe("Campaign");
    expect(c({ referrer_domain: "autoblog.example" })).toBe("Referral");
    expect(c({ utm_source: "partnerx" })).toBe("Other");
  });

  it("treats a self-referral as Direct", () => {
    expect(c({ referrer_domain: "www.deliteauto.com" })).toBe("Direct");
  });
});
