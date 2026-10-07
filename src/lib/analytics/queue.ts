/**
 * Small, dependency-free batching queue. Pure with respect to the environment (transport, timers
 * and the session snapshot are injected) so ordering / batching / retry behaviour is unit-testable.
 *
 * Behaviour:
 *  - events, page views, engagement updates and the latest cart snapshot accumulate in memory and
 *    are sent as ONE request per flush (never one request per interaction);
 *  - flush triggers: batch-size threshold, a short interval, an "immediate" event (cart/checkout,
 *    coalesced over a few hundred ms), and explicit flush on tab hide / pagehide;
 *  - engagement is cumulative per page view, so only the latest value per page view is kept and a
 *    retried/duplicated delivery is harmless (the server takes the max);
 *  - events are deduplicated server-side by event id, so a retry after a network error is safe;
 *  - a failed send is retried a couple of times with backoff, then dropped — analytics must never
 *    accumulate unbounded memory or interfere with shopping.
 */

export interface SessionPayload {
  id: string;
  visitor_id: string;
  landing_path: string;
  referrer: string | null;
  referrer_domain: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  env?: "test";
}
export interface PageViewPayload {
  id: string; path: string; started_at: string;
  odoo_template_id?: number; category_id?: number; referrer_path?: string;
}
export interface EngagementPayload { page_view_id: string; engaged_seconds: number; max_scroll_percent: number; ended_at: string }
export type EventPayload = { id: string; event_name: string; occurred_at: string } & Record<string, unknown>;
export interface CartPayload { id: string; items: { odoo_template_id: number; odoo_variant_id: number; quantity: number; observed_unit_price: number }[] }

export interface Batch {
  session: SessionPayload;
  page_views?: PageViewPayload[];
  engagements?: EngagementPayload[];
  events?: EventPayload[];
  cart?: CartPayload;
}

export type SendResult = "ok" | "drop" | "retry";

export interface QueueDeps {
  send(batch: Batch, keepalive: boolean): Promise<SendResult>;
  session(): SessionPayload | null;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface QueueOptions {
  maxEvents?: number;
  intervalMs?: number;
  immediateMs?: number;
  maxPending?: number;
  maxAttempts?: number;
}

const SERVER_MAX_EVENTS = 50;

export class AnalyticsQueue {
  private pageViews: PageViewPayload[] = [];
  private engagements = new Map<string, EngagementPayload>();
  private events: EventPayload[] = [];
  private cart: CartPayload | null = null;
  private timer: unknown = null;
  private timerDue = Number.POSITIVE_INFINITY;
  private chain: Promise<void> = Promise.resolve();
  private readonly o: Required<QueueOptions>;
  private readonly deps: QueueDeps;

  constructor(deps: QueueDeps, opts: QueueOptions = {}) {
    this.deps = deps;
    this.o = { maxEvents: 10, intervalMs: 5000, immediateMs: 250, maxPending: 200, maxAttempts: 3, ...opts };
  }

  addPageView(pv: PageViewPayload): void {
    this.pageViews.push(pv);
    this.schedule(this.o.intervalMs);
  }

  addEngagement(e: EngagementPayload): void {
    this.engagements.set(e.page_view_id, e);            // cumulative: the latest value supersedes
    this.schedule(this.o.intervalMs);
  }

  addEvent(ev: EventPayload, immediate = false): void {
    this.events.push(ev);
    if (this.events.length > this.o.maxPending) this.events.splice(0, this.events.length - this.o.maxPending);
    if (this.events.length >= this.o.maxEvents) this.flush();
    else this.schedule(immediate ? this.o.immediateMs : this.o.intervalMs);
  }

  /** Latest cart snapshot. `dirty=false` (hydration) is remembered but never triggers a send by itself. */
  setCart(cart: CartPayload | null, send: boolean): void {
    this.cart = cart;
    if (cart && send) this.schedule(this.o.immediateMs);
  }

  get pending(): number {
    return this.pageViews.length + this.engagements.size + this.events.length + (this.cart ? 1 : 0);
  }

  /** Cart snapshot is sent once per change, not re-sent with every batch. */
  private takeCart(): CartPayload | undefined {
    const c = this.cart;
    this.cart = null;
    return c ?? undefined;
  }

  private schedule(ms: number): void {
    const due = Date.now() + ms;
    if (this.timer !== null && this.timerDue <= due) return;
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timerDue = due;
    this.timer = this.deps.setTimer(() => { this.timer = null; this.timerDue = Number.POSITIVE_INFINITY; this.flush(); }, ms);
  }

  /**
   * Builds every pending batch synchronously (so nothing enqueued afterwards can be lost or
   * double-sent) and sends them in order. `keepalive` sends bypass the ordering chain so a
   * pagehide flush is dispatched immediately.
   */
  flush(keepalive = false): Promise<void> {
    if (this.timer !== null) { this.deps.clearTimer(this.timer); this.timer = null; this.timerDue = Number.POSITIVE_INFINITY; }
    const session = this.deps.session();
    if (!session || this.pending === 0) return this.chain;

    const pageViews = this.pageViews.splice(0);
    const engagements = [...this.engagements.values()];
    this.engagements.clear();
    const events = this.events.splice(0);
    const cart = this.takeCart();

    const batches: Batch[] = [];
    let i = 0;
    do {
      const slice = events.slice(i, i + SERVER_MAX_EVENTS);
      const first = i === 0;
      batches.push({
        session,
        ...(first && pageViews.length ? { page_views: pageViews.slice(0, 20) } : {}),
        ...(first && engagements.length ? { engagements: engagements.slice(0, 20) } : {}),
        ...(slice.length ? { events: slice } : {}),
      });
      i += SERVER_MAX_EVENTS;
    } while (i < events.length);
    if (cart) batches[batches.length - 1].cart = cart;

    const run = async () => {
      for (const batch of batches) await this.deliver(batch, keepalive, 1);
    };
    if (keepalive) { void run(); return this.chain; }
    this.chain = this.chain.then(run, run);
    return this.chain;
  }

  private async deliver(batch: Batch, keepalive: boolean, attempt: number): Promise<void> {
    let result: SendResult;
    try { result = await this.deps.send(batch, keepalive); } catch { result = "retry"; }
    if (result !== "retry" || attempt >= this.o.maxAttempts) return;
    // Retry with backoff off the ordering chain so a slow network can't stall later batches.
    setTimeoutSafe(() => { void this.deliver(batch, false, attempt + 1); }, attempt * 4000);
  }
}

function setTimeoutSafe(fn: () => void, ms: number) {
  if (typeof setTimeout === "function") setTimeout(fn, ms);
}
