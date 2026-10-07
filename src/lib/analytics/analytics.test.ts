import { describe, expect, it, vi } from "vitest";
import { EngagementGate, EngagementTimer, ScrollDepth } from "./engagement";
import { AnalyticsQueue, type Batch, type QueueDeps, type SendResult, type SessionPayload } from "./queue";
import { pageInfo, pageTypeFor, sanitizeClientPath } from "./pathing";

/** A controllable clock: tests advance time explicitly — nothing here ever really waits. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("engagement time (mocked clock)", () => {
  it("visible for 10 seconds counts about 10 seconds", () => {
    const c = clock();
    const timer = new EngagementTimer(c.now, true);
    c.advance(10_000);
    expect(timer.seconds()).toBe(10);
  });

  it("a hidden tab does not keep accruing", () => {
    const c = clock();
    const timer = new EngagementTimer(c.now, true);
    c.advance(4_000);
    timer.setActive(false);                    // tab hidden
    c.advance(8 * 3_600_000);                  // left hidden overnight
    expect(timer.seconds()).toBe(4);
    timer.setActive(true);                     // came back
    c.advance(6_000);
    expect(timer.seconds()).toBe(10);
  });

  it("caps a single page view at 4 hours", () => {
    const c = clock();
    const timer = new EngagementTimer(c.now, true);
    c.advance(24 * 3_600_000);
    expect(timer.seconds()).toBe(14_400);
  });

  it("route change / pagehide flush semantics: pausing then reading is stable and idempotent", () => {
    const c = clock();
    const timer = new EngagementTimer(c.now, true);
    c.advance(2_500);
    timer.setActive(false);
    const first = timer.seconds();
    c.advance(60_000);
    expect(timer.seconds()).toBe(first);       // repeated flushes report the same cumulative value
  });

  it("reset() restarts accumulation for a new page view", () => {
    const c = clock();
    const timer = new EngagementTimer(c.now, true);
    c.advance(5_000);
    timer.reset(true);
    c.advance(1_000);
    expect(timer.seconds()).toBe(1);
  });

  it("idle visitor stops accruing until their next input (visible-but-abandoned tab)", () => {
    const c = clock();
    const gate = new EngagementGate(c.now, true, 60_000);
    const timer = new EngagementTimer(c.now, gate.engaged);
    c.advance(30_000);
    expect(gate.tick()).toBe(true);            // still within the idle window
    c.advance(31_000);                         // 61 s since last input
    timer.setActive(gate.tick());              // -> idle
    expect(gate.engaged).toBe(false);
    const atIdle = timer.seconds();
    c.advance(3 * 3_600_000);                  // tab stays visible all night
    expect(timer.seconds()).toBe(atIdle);
    timer.setActive(gate.input());             // user moves the mouse
    c.advance(5_000);
    expect(timer.seconds()).toBeCloseTo(atIdle + 5, 1);
  });

  it("a hidden tab is never engaged even with recent input", () => {
    const c = clock();
    const gate = new EngagementGate(c.now, true);
    gate.input();
    expect(gate.setVisible(false)).toBe(false);
    expect(gate.input()).toBe(false);
    expect(gate.setVisible(true)).toBe(true);
  });
});

describe("scroll depth", () => {
  it("keeps the maximum reached, not the current position", () => {
    const s = new ScrollDepth();
    s.update(0, 800, 3000);
    s.update(1100, 800, 3000);                 // 50% of the scrollable 2200px
    s.update(200, 800, 3000);                  // scrolled back up
    expect(s.percent()).toBe(50);
  });

  it("a page that fits the viewport counts as fully seen", () => {
    const s = new ScrollDepth();
    s.update(0, 900, 700);
    expect(s.percent()).toBe(100);
  });
});

describe("page classification (client)", () => {
  it("never keeps query strings, collapses order ids, refuses the admin panel", () => {
    expect(sanitizeClientPath("/shop")).toBe("/shop");
    expect(sanitizeClientPath("/order/8f2c-1234")).toBe("/order/:id");
    expect(sanitizeClientPath("/admin/analytics")).toBeNull();
    expect(sanitizeClientPath("/some/unknown/route")).toBe("/other");
    expect(pageTypeFor("/product/seat-cover--442")).toBe("product");
  });

  it("extracts the Odoo template id from a real catalog product slug", () => {
    expect(pageInfo("/product/grass-18-mm-set-of-5--8", "")?.odooTemplateId).toBe(8);
    expect(pageInfo("/product/mock-seat-cover", "")?.odooTemplateId).toBeUndefined();
  });

  it("a different shop listing is a new page view; pagination/sort are not", () => {
    const a = pageInfo("/shop", "?category=12&page=1&sort=price-asc")?.signature;
    const b = pageInfo("/shop", "?category=12&page=2&sort=name")?.signature;
    const c = pageInfo("/shop", "?category=13")?.signature;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(pageInfo("/shop", "?category=12&brand=25")?.categoryId).toBe(12);
    expect(pageInfo("/shop", "?category=12&brand=25")?.brandId).toBe(25);
    expect(pageInfo("/shop", "?category=abc")?.categoryId).toBeUndefined();
  });
});

describe("batching queue", () => {
  const session: SessionPayload = {
    id: "s", visitor_id: "v", landing_path: "/", referrer: null, referrer_domain: null,
    utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null,
  };
  function build(results: SendResult[] = []) {
    const sent: Batch[] = [];
    const timers: { fn: () => void; ms: number; id: number }[] = [];
    let n = 0;
    const deps: QueueDeps = {
      send: async (b) => { sent.push(b); return results.shift() ?? "ok"; },
      session: () => session,
      setTimer: (fn, ms) => { const id = ++n; timers.push({ fn, ms, id }); return id; },
      clearTimer: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); },
    };
    return { q: new AnalyticsQueue(deps, { maxEvents: 3 }), sent, timers };
  }
  const event = (i: number) => ({ id: `e${i}`, event_name: "cart_viewed", occurred_at: "2026-09-21T10:00:00.000Z" });

  it("does not send one request per interaction — events accumulate until a flush", async () => {
    const { q, sent } = build();
    q.addEvent(event(1));
    q.addEvent(event(2));
    expect(sent).toHaveLength(0);
    await q.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].events).toHaveLength(2);
  });

  it("flushes automatically at the batch-size threshold", async () => {
    const { q, sent } = build();
    q.addEvent(event(1));
    q.addEvent(event(2));
    q.addEvent(event(3));                      // maxEvents = 3
    await q.flush();
    expect(sent.flatMap((b) => b.events ?? [])).toHaveLength(3);
  });

  it("keeps only the latest cumulative engagement per page view", async () => {
    const { q, sent } = build();
    q.addEngagement({ page_view_id: "p1", engaged_seconds: 5, max_scroll_percent: 10, ended_at: "t" });
    q.addEngagement({ page_view_id: "p1", engaged_seconds: 12, max_scroll_percent: 40, ended_at: "t" });
    await q.flush();
    expect(sent[0].engagements).toEqual([{ page_view_id: "p1", engaged_seconds: 12, max_scroll_percent: 40, ended_at: "t" }]);
  });

  it("sends the cart snapshot once per change, not with every batch", async () => {
    const { q, sent } = build();
    q.setCart({ id: "c", items: [{ odoo_template_id: 1, odoo_variant_id: 0, quantity: 1, observed_unit_price: 10 }] }, true);
    await q.flush();
    q.addEvent(event(1));
    await q.flush();
    expect(sent[0].cart?.id).toBe("c");
    expect(sent[1].cart).toBeUndefined();
  });

  it("hydration (send=false) remembers the cart but schedules no request", () => {
    const { q, timers } = build();
    q.setCart({ id: "c", items: [] }, false);
    expect(timers).toHaveLength(0);
  });

  it("schedules a short flush for immediate events and a slower one otherwise", () => {
    const { q, timers } = build();
    q.addEvent(event(1), false);
    expect(timers[0].ms).toBe(5000);
    q.addEvent(event(2), true);
    expect(timers.at(-1)?.ms).toBe(250);       // sooner deadline replaces the slower timer
    expect(timers).toHaveLength(1);
  });

  it("splits more than 50 events into multiple batches (server limit) and keeps the cart on the last", async () => {
    const { q, sent } = build();
    for (let i = 0; i < 120; i++) q.addEvent(event(i));
    q.setCart({ id: "c", items: [] }, true);
    await q.flush();
    expect(sent.every((b) => (b.events?.length ?? 0) <= 50)).toBe(true);
    expect(sent.flatMap((b) => b.events ?? [])).toHaveLength(120);
    expect(sent.at(-1)?.cart?.id).toBe("c");
  });

  it("retries a failed batch a limited number of times, then drops it (no unbounded growth)", async () => {
    vi.useFakeTimers();
    try {
      const { q, sent } = build(["retry", "retry", "retry", "retry"]);
      q.addEvent(event(1));
      await q.flush();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(sent.length).toBe(3);             // 1 attempt + 2 retries (maxAttempts = 3), then dropped
    } finally {
      vi.useRealTimers();
    }
  });

  it("never throws into the caller when the transport rejects", async () => {
    const q = new AnalyticsQueue({
      send: () => Promise.reject(new Error("network down")),
      session: () => session, setTimer: () => 1, clearTimer: () => undefined,
    });
    q.addEvent(event(1));
    await expect(q.flush()).resolves.toBeUndefined();
  });

  it("does nothing when there is no session (analytics off) and keeps pending data", async () => {
    const sent: Batch[] = [];
    const q = new AnalyticsQueue({ send: async (b) => { sent.push(b); return "ok"; }, session: () => null, setTimer: () => 1, clearTimer: () => undefined });
    q.addEvent(event(1));
    await q.flush();
    expect(sent).toHaveLength(0);
  });
});
