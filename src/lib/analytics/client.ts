import { supabase } from "../supabaseClient";
import { analyticsMode } from "./config";
import { AnalyticsQueue, type Batch, type CartPayload, type SendResult, type SessionPayload } from "./queue";
import { pageTypeFor, sanitizeClientPath, type PageInfo } from "./pathing";

/**
 * First-party analytics client. See Documentations MD/delite-analytics.md for the full design.
 *
 * Non-negotiables implemented here:
 *  - Anonymous identity is a random UUID only (visitor: localStorage; session: sessionStorage,
 *    rotated after 30 min of inactivity). No fingerprinting of any kind.
 *  - A browser never asserts *who* it is: it only forwards its Supabase access token; the Edge
 *    Function verifies the token and decides user_id.
 *  - Nothing here can break shopping: every public function swallows its own errors, sends are
 *    asynchronous and batched, and failures are retried a couple of times then dropped.
 */

// ------------------------------------------------------------------------------------------
// Typed event taxonomy — mirrors the server's per-event schemas (_shared/analytics/core.ts).
// `surface` / `strategy` must be lowercase snake_case codes (server enforces ^[a-z0-9_]{1,40}$).
// ------------------------------------------------------------------------------------------
type Product = { odoo_template_id: number; odoo_variant_id?: number };
export interface EventMap {
  product_view: Product;
  search_submitted: { search_query: string; result_count: number };
  search_zero_results: { search_query: string };
  search_result_click: { search_query: string; odoo_template_id: number; duration_ms?: number };
  category_view: { category_id: number };
  brand_view: { brand_id: number };
  add_to_cart: Product & { quantity: number; value: number; surface?: string };
  remove_from_cart: Product & { quantity: number; value?: number };
  cart_quantity_changed: Product & { quantity: number; value?: number };
  cart_viewed: { quantity?: number; value?: number };
  wishlist_add: { odoo_template_id: number; surface?: string };
  wishlist_remove: { odoo_template_id: number; surface?: string };
  checkout_started: { quantity?: number; value?: number };
  checkout_step_viewed: { metadata: { step: "details" | "review" | "payment" | "confirmation" } };
  checkout_completed: { value?: number };
  checkout_failed: { metadata?: { reason?: string } };
  payment_method_selected: { metadata?: { method?: string } };
  payment_started: { value?: number; metadata?: { method?: string } };
  payment_success: { value?: number; metadata?: { method?: string } };
  payment_failed: { metadata?: { method?: string } };
  recommendation_impression: { odoo_template_id: number; surface: string; strategy: string };
  recommendation_click: { odoo_template_id: number; surface: string; strategy: string };
  recommendation_add_to_cart: { odoo_template_id: number; surface: string; strategy: string };
  navigation_click: { surface: string; metadata?: { target?: string } };
  promotion_impression: { surface: string; metadata?: { promotion_id?: string; label?: string } };
  promotion_click: { surface: string; metadata?: { promotion_id?: string; label?: string } };
  contact_started: { surface?: string };
  contact_submitted: { surface?: string };
}
export type AnalyticsEventName = keyof EventMap;

/** Sent promptly (short coalescing delay) rather than waiting for the normal interval. */
const IMMEDIATE = new Set<AnalyticsEventName>([
  "add_to_cart", "remove_from_cart", "cart_quantity_changed", "cart_viewed",
  "checkout_started", "checkout_step_viewed", "checkout_completed", "checkout_failed",
  "payment_method_selected", "payment_started", "payment_success", "payment_failed",
  "recommendation_add_to_cart", "contact_submitted",
]);
const CART_EVENTS = new Set<AnalyticsEventName>([
  "add_to_cart", "remove_from_cart", "cart_quantity_changed", "cart_viewed",
  "checkout_started", "checkout_step_viewed", "checkout_completed", "checkout_failed",
  "payment_method_selected", "payment_started", "payment_success", "payment_failed", "recommendation_add_to_cart",
]);
/** Counted once per page view, not once per render / re-open. */
const DEDUPED_PER_PAGE_VIEW = new Set<AnalyticsEventName>(["product_view", "recommendation_impression", "promotion_impression"]);

// ------------------------------------------------------------------------------------------
// Storage-backed identity
// ------------------------------------------------------------------------------------------
const K = {
  visitor: "delite-analytics-visitor",
  session: "delite-analytics-session",
  last: "delite-analytics-last",
  cart: "delite-analytics-cart",
  cartActive: "delite-analytics-cart-active",
} as const;
const INACTIVE_MS = 30 * 60 * 1000;
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";
const TOKEN = /^[A-Za-z0-9_.:\- /+]{1,100}$/;

export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function storedId(storage: Storage, key: string): string {
  let id = storage.getItem(key);
  if (!id) { id = uuid(); storage.setItem(key, id); }
  return id;
}

type SessionMeta = Omit<SessionPayload, "visitor_id" | "env">;

function captureSessionMeta(): SessionMeta {
  const params = new URLSearchParams(window.location.search);
  const utm = (key: string) => {
    const v = params.get(key)?.trim();
    return v && TOKEN.test(v) ? v : null;
  };
  let referrer: string | null = null;
  let referrerDomain: string | null = null;
  try {
    if (document.referrer) {
      const u = new URL(document.referrer);
      // Same-site navigation is not an acquisition source.
      if (u.hostname !== window.location.hostname) {
        referrerDomain = u.hostname.slice(0, 100);
        referrer = `${u.hostname}${u.pathname}`.slice(0, 200);
      }
    }
  } catch { /* malformed referrer */ }
  return {
    id: uuid(),
    landing_path: sanitizeClientPath(window.location.pathname) ?? "/",
    referrer, referrer_domain: referrerDomain,
    utm_source: utm("utm_source"), utm_medium: utm("utm_medium"), utm_campaign: utm("utm_campaign"),
    utm_content: utm("utm_content"), utm_term: utm("utm_term"),
  };
}

// ------------------------------------------------------------------------------------------
// Runtime
// ------------------------------------------------------------------------------------------
interface Runtime { queue: AnalyticsQueue; mode: "live" | "test" }
let rt: Runtime | null = null;
let initialized = false;
let authToken: string | null = null;
let currentUserId: string | null = null;
let lastCart: CartPayload | null = null;
let resolveAuthReady: () => void = () => undefined;
const authReady = new Promise<void>((resolve) => { resolveAuthReady = resolve; });

interface CurrentPageView { id: string; path: string; signature: string; startedMs: number }
let current: CurrentPageView | null = null;
const onceKeys = new Set<string>();

/** The admin panel is never tracked (also covers storefront components reused in admin previews). */
function isAdminRoute(): boolean {
  return window.location.pathname.startsWith("/admin");
}

function currentSession(): SessionPayload | null {
  try {
    const raw = sessionStorage.getItem(K.session);
    if (!raw || !rt) return null;
    const meta = JSON.parse(raw) as SessionMeta;
    return { ...meta, visitor_id: storedId(localStorage, K.visitor), ...(rt.mode === "test" ? { env: "test" as const } : {}) };
  } catch { return null; }
}

/** Creates the session on first use and rotates it after 30 minutes of inactivity. */
function touchSession(): SessionPayload | null {
  if (!rt) return null;
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(K.last) || 0);
    const hasSession = !!sessionStorage.getItem(K.session);
    let rotated = false;
    if (hasSession && last && now - last > INACTIVE_MS) {
      void rt.queue.flush();                      // deliver the old session's data first
      sessionStorage.removeItem(K.session);
      rotated = true;
    }
    if (!sessionStorage.getItem(K.session)) {
      sessionStorage.setItem(K.session, JSON.stringify(captureSessionMeta()));
      onceKeys.clear();
    }
    sessionStorage.setItem(K.last, String(now));
    if (rotated && current) {
      // The visitor is still on a page: give the new session its own entrance page view.
      const info = { path: current.path, signature: current.signature } as PageInfo;
      current = null;
      startPageView({ ...info, pageType: pageTypeFor(info.path) });
    }
    return currentSession();
  } catch { return null; }
}

async function send(batch: Batch, keepalive: boolean): Promise<SendResult> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return "drop";
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/analytics-track`;

  // Page-unload delivery: sendBeacon is the one mechanism browsers guarantee to complete, and it
  // needs no CORS preflight. It cannot set headers, so the publishable key travels as a query
  // param (it is a public key) and the user token in the body — the server verifies it either way.
  if (keepalive && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const payload = JSON.stringify({ ...batch, auth_token: authToken });
      if (navigator.sendBeacon(`${url}?apikey=${encodeURIComponent(SUPABASE_KEY)}`, new Blob([payload], { type: "text/plain;charset=UTF-8" }))) return "ok";
    } catch { /* fall through to keepalive fetch */ }
  }
  if (!keepalive) await Promise.race([authReady, new Promise((r) => setTimeout(r, 1500))]);
  try {
    const res = await fetch(url, {
      method: "POST", keepalive,
      headers: { "content-type": "application/json", apikey: SUPABASE_KEY, ...(authToken ? { authorization: `Bearer ${authToken}` } : {}) },
      body: JSON.stringify(batch),
    });
    if (res.ok) return "ok";
    return res.status === 429 || res.status >= 500 ? "retry" : "drop";
  } catch {
    return "retry";
  }
}

export function initAnalytics(): void {
  if (initialized) return;
  initialized = true;
  try {
    const mode = analyticsMode();
    if (mode === "off" || !supabase) return;
    rt = {
      mode,
      queue: new AnalyticsQueue({
        send, session: currentSession,
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (h) => window.clearTimeout(h as number),
      }),
    };
    void supabase.auth.getSession().then(({ data }) => {
      authToken = data.session?.access_token ?? null;
      currentUserId = data.session?.user.id ?? null;
      resolveAuthReady();
    }).catch(() => resolveAuthReady());
    supabase.auth.onAuthStateChange((_event, session) => {
      authToken = session?.access_token ?? null;
      const next = session?.user.id ?? null;
      if (next !== currentUserId) handleUserChange(currentUserId, next);
      currentUserId = next;
    });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushAnalytics(true); });
    window.addEventListener("pagehide", () => flushAnalytics(true));
  } catch { /* analytics must never break the app */ }
}

/** Login / logout / user switch. Server still verifies the token; this only triggers the send. */
function handleUserChange(prev: string | null, next: string | null): void {
  try {
    if (!rt) return;
    if (prev && prev !== next) {
      // Logout or account switch: never let the next person's activity share the previous session.
      void rt.queue.flush();
      sessionStorage.removeItem(K.session);
    }
    if (next) {
      const session = touchSession();
      if (!session) return;
      // Attach the authenticated user to the current session/cart without waiting for another event.
      if (lastCart && lastCart.items.length > 0) rt.queue.setCart(lastCart, true);
      else void send({ session }, false);
    }
  } catch { /* ignore */ }
}

// ------------------------------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------------------------------
export function track<N extends AnalyticsEventName>(name: N, fields: EventMap[N]): void {
  try {
    if (!rt || isAdminRoute() || !touchSession()) return;
    const f = fields as unknown as Record<string, unknown>;
    if (DEDUPED_PER_PAGE_VIEW.has(name)) {
      const key = `${name}:${current?.id ?? "none"}:${f.surface ?? ""}:${f.odoo_template_id ?? (f.metadata as { promotion_id?: string } | undefined)?.promotion_id ?? ""}`;
      if (onceKeys.has(key)) return;
      onceKeys.add(key);
    }
    const path = current?.path ?? sanitizeClientPath(window.location.pathname) ?? "/";
    const clean = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined));
    rt.queue.addEvent({
      id: uuid(), event_name: name, occurred_at: new Date().toISOString(),
      ...(current ? { page_view_id: current.id } : {}), page_path: path, page_type: pageTypeFor(path),
      ...clean, ...(CART_EVENTS.has(name) ? { cart_id: cartId() } : {}),
    }, IMMEDIATE.has(name));
  } catch { /* never surface analytics errors */ }
}

/** Starts a page view. Returns null when analytics is off. A repeat of the same view within 1.5 s
 * (React StrictMode's mount/unmount/mount) reuses the existing view rather than counting twice. */
export function startPageView(info: PageInfo): string | null {
  try {
    if (!rt || !touchSession()) return null;
    const now = Date.now();
    if (current && current.signature === info.signature && now - current.startedMs < 1500) return current.id;
    const previousPath = current?.path;
    const id = uuid();
    current = { id, path: info.path, signature: info.signature, startedMs: now };
    rt.queue.addPageView({
      id, path: info.path, started_at: new Date(now).toISOString(),
      ...(info.odooTemplateId ? { odoo_template_id: info.odooTemplateId } : {}),
      ...(info.categoryId ? { category_id: info.categoryId } : {}),
      ...(previousPath ? { referrer_path: previousPath } : {}),
    });
    if (info.categoryId) track("category_view", { category_id: info.categoryId });
    if (info.brandId) track("brand_view", { brand_id: info.brandId });
    return id;
  } catch { return null; }
}

export function currentPageViewId(): string | null {
  return current?.id ?? null;
}

/** Cumulative engaged seconds + max scroll for the current page view (server keeps the max). */
export function reportEngagement(pageViewId: string, seconds: number, scrollPercent: number): void {
  try {
    if (!rt || pageViewId !== current?.id) return;
    rt.queue.addEngagement({
      page_view_id: pageViewId, engaged_seconds: seconds,
      max_scroll_percent: Math.max(0, Math.min(100, Math.round(scrollPercent))), ended_at: new Date().toISOString(),
    });
  } catch { /* ignore */ }
}

export function flushAnalytics(keepalive = false): void {
  try { void rt?.queue.flush(keepalive); } catch { /* ignore */ }
}

// --- cart ---------------------------------------------------------------------------------
export function cartId(): string {
  try { return storedId(localStorage, K.cart); } catch { return "00000000-0000-4000-8000-000000000000"; }
}
export function rotateAnalyticsCart(): void {
  try { localStorage.setItem(K.cart, uuid()); localStorage.removeItem(K.cartActive); lastCart = null; } catch { /* storage unavailable */ }
}

export interface CartSnapshotItem { odoo_template_id: number; odoo_variant_id: number; quantity: number; observed_unit_price: number }

/**
 * Records the latest cart contents. `changed=false` (initial hydration from localStorage) only
 * remembers the snapshot — it must not count as cart activity (a returning visitor merely
 * browsing shouldn't make an old abandoned cart look "active").
 */
export function syncCart(items: CartSnapshotItem[], changed: boolean): void {
  try {
    if (!rt) return;
    const id = cartId();
    const hadItems = localStorage.getItem(K.cartActive) === id;
    if (items.length === 0 && !hadItems) return;             // nothing ever tracked for this cart
    if (items.length > 0) localStorage.setItem(K.cartActive, id);
    lastCart = { id, items: items.slice(0, 50) };
    if (changed && touchSession()) rt.queue.setCart(lastCart, true);
  } catch { /* ignore */ }
}

/** Identity block sent to create-order so the SERVER can record the purchase. */
export function analyticsIdentityForOrder(): { visitor_id: string; session_id: string; cart_id: string; env?: "test" } | null {
  try {
    const s = touchSession();
    if (!s) return null;
    return { visitor_id: s.visitor_id, session_id: s.id, cart_id: cartId(), ...(s.env ? { env: s.env } : {}) };
  } catch { return null; }
}
