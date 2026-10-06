// Pure analytics logic shared by the analytics-track Edge Function (Deno) and its Vitest suite
// (Node). Deliberately dependency-free and free of relative imports so both runtimes load it
// unchanged. Everything security-relevant lives here: the browser is never trusted, so this module
// is the single gatekeeper for what may be stored (event allowlist, per-event schemas, sizes,
// timestamps, URL/param sanitisation). See Documentations MD/delite-analytics.md.

export const EVENT_NAMES = [
  "product_view", "search_submitted", "search_result_click", "search_zero_results",
  "category_view", "brand_view",
  "add_to_cart", "remove_from_cart", "cart_quantity_changed", "cart_viewed",
  "wishlist_add", "wishlist_remove",
  "checkout_started", "checkout_step_viewed", "checkout_completed", "checkout_failed", "purchase",
  "payment_method_selected", "payment_started", "payment_success", "payment_failed",
  "recommendation_impression", "recommendation_click", "recommendation_add_to_cart",
  "navigation_click", "promotion_impression", "promotion_click",
  "contact_started", "contact_submitted",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export const PAGE_TYPES = [
  "home", "shop", "product", "brands", "cart", "checkout", "account", "order_confirmation",
  "about", "contact", "login", "signup", "legal", "other",
] as const;

export const LIMITS = {
  bodyBytes: 32_768,
  events: 50,
  pageViews: 20,
  engagements: 20,
  cartItems: 50,
  maxQuantity: 1000,
  maxValue: 10_000_000,
  maxEngagedSeconds: 14_400,
  metadataBytes: 1024,
  eventsPerMinutePerVisitor: 240,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TOKEN = /^[A-Za-z0-9_.:\- /+]{1,100}$/;
const SAFE_CODE = /^[a-z0-9_-]{1,40}$/;
const MAX_PAST_MS = 48 * 3_600_000;
const MAX_FUTURE_MS = 2 * 60_000;

// ---------------------------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------------------------
export interface SessionInput {
  id: string; visitor_id: string; landing_path: string; referrer: string | null; referrer_domain: string | null;
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null;
  utm_term: string | null; is_test: boolean;
}
export interface PageViewInput {
  id: string; path: string; page_type: string; odoo_template_id: number | null; odoo_variant_id: number | null;
  category_id: number | null; referrer_path: string | null; started_at: string;
}
export interface EngagementInput { page_view_id: string; engaged_seconds: number; max_scroll_percent: number; ended_at: string }
export interface EventInput {
  id: string; event_name: EventName; occurred_at: string; page_view_id: string | null; page_path: string | null;
  page_type: string | null; odoo_template_id: number | null; odoo_variant_id: number | null; category_id: number | null;
  brand_id: number | null; cart_id: string | null; quantity: number | null; value: number | null;
  surface: string | null; strategy: string | null; search_query: string | null; search_query_norm: string | null;
  result_count: number | null; duration_ms: number | null; metadata: Record<string, string>;
}
export interface CartItemInput { odoo_template_id: number; odoo_variant_id: number; quantity: number; observed_unit_price: number }
export interface CartInput { id: string; items: CartItemInput[] }
export interface ValidBatch {
  session: SessionInput; page_views: PageViewInput[]; engagements: EngagementInput[]; events: EventInput[];
  cart: CartInput | null; auth_token: string | null;
  /** Reasons individual events were skipped (lenient mode only). */
  rejected: string[];
}
export type ValidationResult = { ok: true; batch: ValidBatch } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

// ---------------------------------------------------------------------------------------------
// Primitive sanitisers
// ---------------------------------------------------------------------------------------------
export function asUuid(v: unknown): string | null {
  return typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null;
}
export function asInt(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max ? v : null;
}
export function asNum(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 100) / 100 : null;
}
function asToken(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return SAFE_TOKEN.test(t) ? t : null;
}
function asCode(v: unknown): string | null {
  return typeof v === "string" && SAFE_CODE.test(v) ? v : null;
}

/** ISO timestamp clamped into [now-48h, now+2min]; anything else falls back to `nowMs`. */
export function clampTimestamp(v: unknown, nowMs: number): string {
  const t = typeof v === "string" ? Date.parse(v) : Number.NaN;
  if (!Number.isFinite(t) || t > nowMs + MAX_FUTURE_MS || t < nowMs - MAX_PAST_MS) return new Date(nowMs).toISOString();
  return new Date(Math.min(t, nowMs)).toISOString();
}

// ---------------------------------------------------------------------------------------------
// URL / query privacy
// ---------------------------------------------------------------------------------------------
const KNOWN_PATHS = new Set(["/", "/shop", "/brands", "/cart", "/checkout", "/account", "/about", "/contact", "/login", "/signup", "/terms", "/refund-policy"]);

/**
 * Reduces a URL path to an allowlisted, non-sensitive form. Query strings and fragments are never
 * kept (they can carry tokens/reset links); order ids are collapsed; unknown routes become /other.
 */
export function sanitizePath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const path = input.split(/[?#]/)[0].trim();
  if (!path.startsWith("/") || path.length > 200) return null;
  if (path.startsWith("/order/")) return "/order/:id";
  if (path.startsWith("/product/")) return /^\/product\/[A-Za-z0-9._~-]{1,150}$/.test(path) ? path : "/product/:invalid";
  if (path.startsWith("/admin")) return null;                  // never track the admin panel
  return KNOWN_PATHS.has(path) ? path : "/other";
}

export function pageTypeFor(path: string): (typeof PAGE_TYPES)[number] {
  if (path === "/") return "home";
  if (path.startsWith("/product/")) return "product";
  if (path.startsWith("/order/")) return "order_confirmation";
  if (path === "/terms" || path === "/refund-policy") return "legal";
  const seg = path.split("/")[1];
  return (PAGE_TYPES as readonly string[]).includes(seg) ? (seg as (typeof PAGE_TYPES)[number]) : "other";
}

export function normalizeQuery(input: unknown): { display: string; norm: string } | null {
  if (typeof input !== "string") return null;
  const display = input.replace(/\s+/g, " ").trim().slice(0, 120);
  if (display.length < 1) return null;
  // Never store something that looks like a credential / card / e-mail typed into the search box.
  if (/@/.test(display) || /\b\d{12,19}\b/.test(display)) return null;
  return { display, norm: display.toLowerCase() };
}

function safeHost(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const h = v.trim().toLowerCase();
  return /^[a-z0-9.-]{1,100}$/.test(h) && h.includes(".") ? h : null;
}
function safeReferrer(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const r = v.split(/[?#]/)[0].trim().toLowerCase();
  return /^[a-z0-9.\-_/~%]{1,200}$/.test(r) ? r : null;
}

// ---------------------------------------------------------------------------------------------
// Per-event schemas
// ---------------------------------------------------------------------------------------------
interface Rule {
  required?: string[];
  allowed: string[];                       // beyond the common fields
  meta?: string[];                         // allowed metadata keys
}
const COMMON = ["id", "event_name", "occurred_at", "page_view_id", "page_path", "page_type", "cart_id"];
const RULES: Record<EventName, Rule | null> = {
  product_view: { required: ["odoo_template_id"], allowed: ["odoo_variant_id"] },
  search_submitted: { required: ["search_query", "result_count"], allowed: [] },
  search_result_click: { required: ["search_query", "odoo_template_id"], allowed: ["duration_ms"] },
  search_zero_results: { required: ["search_query"], allowed: [] },
  category_view: { required: ["category_id"], allowed: [] },
  brand_view: { required: ["brand_id"], allowed: [] },
  add_to_cart: { required: ["odoo_template_id", "quantity", "value"], allowed: ["odoo_variant_id", "surface"] },
  remove_from_cart: { required: ["odoo_template_id", "quantity"], allowed: ["odoo_variant_id", "value"] },
  cart_quantity_changed: { required: ["odoo_template_id", "quantity"], allowed: ["odoo_variant_id", "value"], meta: ["from"] },
  cart_viewed: { allowed: ["quantity", "value"] },
  wishlist_add: { required: ["odoo_template_id"], allowed: ["surface"] },
  wishlist_remove: { required: ["odoo_template_id"], allowed: ["surface"] },
  checkout_started: { allowed: ["quantity", "value"] },
  checkout_step_viewed: { allowed: [], meta: ["step"], required: ["meta.step"] },
  checkout_completed: { allowed: ["value"] },
  checkout_failed: { allowed: [], meta: ["reason"] },
  purchase: null,                                              // server-owned: rejected from browsers
  payment_method_selected: { allowed: [], meta: ["method"] },
  payment_started: { allowed: ["value"], meta: ["method"] },
  payment_success: { allowed: ["value"], meta: ["method"] },
  payment_failed: { allowed: [], meta: ["method"] },
  recommendation_impression: { required: ["odoo_template_id", "surface", "strategy"], allowed: [] },
  recommendation_click: { required: ["odoo_template_id", "surface", "strategy"], allowed: [] },
  recommendation_add_to_cart: { required: ["odoo_template_id", "surface", "strategy"], allowed: [] },
  navigation_click: { required: ["surface"], allowed: [], meta: ["target"] },
  promotion_impression: { required: ["surface"], allowed: [], meta: ["promotion_id", "label"] },
  promotion_click: { required: ["surface"], allowed: [], meta: ["promotion_id", "label"] },
  contact_started: { allowed: ["surface"] },
  contact_submitted: { allowed: ["surface"] },
};
const CHECKOUT_STEPS = new Set(["details", "review", "payment", "confirmation"]);

function sanitizeMeta(raw: unknown, allowedKeys: string[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  if (raw === undefined || raw === null) return out;
  if (!isObj(raw)) return null;
  if (JSON.stringify(raw).length > LIMITS.metadataBytes) return null;   // oversized => reject the event
  for (const [k, v] of Object.entries(raw)) {
    if (!allowedKeys.includes(k)) continue;                     // unknown keys are dropped, not stored
    if (typeof v !== "string" && typeof v !== "number") continue;
    const s = String(v).replace(/\s+/g, " ").trim().slice(0, 80);
    if (k === "target") { const p = sanitizePath(s); if (p) out[k] = p; continue; }
    if (k === "step") { if (CHECKOUT_STEPS.has(s)) out[k] = s; continue; }
    if (k === "reason") { if (SAFE_CODE.test(s)) out[k] = s; continue; }
    if (s) out[k] = s;
  }
  if (JSON.stringify(out).length > LIMITS.metadataBytes) return null;
  return out;
}

function validateEvent(raw: unknown, nowMs: number): EventInput | string {
  if (!isObj(raw)) return "event must be an object";
  const name = raw.event_name;
  if (typeof name !== "string" || !(EVENT_NAMES as readonly string[]).includes(name)) return "unknown event_name";
  const eventName = name as EventName;
  const rule = RULES[eventName];
  if (rule === null) return "purchase is recorded by the server only";
  const id = asUuid(raw.id);
  if (!id) return "invalid event id";

  // Reject fields outside this event's schema (strict: nothing arbitrary reaches storage).
  const allowedFields = new Set<string>([
    ...COMMON, ...rule.allowed, ...(rule.required ?? []).filter((f) => !f.startsWith("meta.")),
    ...(rule.meta ? ["metadata"] : []),
  ]);
  for (const key of Object.keys(raw)) {
    if (!allowedFields.has(key)) return `field not allowed for ${eventName}: ${key}`;
  }

  const q = raw.search_query !== undefined ? normalizeQuery(raw.search_query) : null;
  const meta = sanitizeMeta(raw.metadata, rule.meta ?? []);
  if (meta === null) return "invalid metadata";
  const ev: EventInput = {
    id, event_name: eventName, occurred_at: clampTimestamp(raw.occurred_at, nowMs),
    page_view_id: asUuid(raw.page_view_id), page_path: sanitizePath(raw.page_path),
    page_type: (PAGE_TYPES as readonly string[]).includes(String(raw.page_type)) ? String(raw.page_type) : null,
    odoo_template_id: asInt(raw.odoo_template_id, 1, 2_147_483_647),
    odoo_variant_id: asInt(raw.odoo_variant_id, 1, 2_147_483_647),
    category_id: asInt(raw.category_id, 1, 2_147_483_647), brand_id: asInt(raw.brand_id, 1, 2_147_483_647),
    cart_id: asUuid(raw.cart_id),
    quantity: asInt(raw.quantity, 0, LIMITS.maxQuantity), value: asNum(raw.value, 0, LIMITS.maxValue),
    surface: asCode(raw.surface), strategy: asCode(raw.strategy),
    search_query: q?.display ?? null, search_query_norm: q?.norm ?? null,
    result_count: asInt(raw.result_count, 0, 1_000_000), duration_ms: asInt(raw.duration_ms, 0, 3_600_000),
    metadata: meta,
  };
  for (const f of rule.required ?? []) {
    if (f.startsWith("meta.")) { if (!ev.metadata[f.slice(5)]) return `missing ${f}`; continue; }
    if ((ev as unknown as Obj)[f] === null || (ev as unknown as Obj)[f] === undefined) return `missing or invalid ${f}`;
  }
  // A quantity of 0 is only meaningful for cart_quantity_changed (removal via the stepper).
  if (eventName === "add_to_cart" && (ev.quantity ?? 0) < 1) return "invalid quantity";
  return ev;
}

// ---------------------------------------------------------------------------------------------
// Batch validation
// ---------------------------------------------------------------------------------------------
/**
 * @param lenientEvents when true, an individually-invalid event is skipped (and listed in the
 * result's `rejected` array) instead of failing the whole batch. Structural errors and any
 * attempt to submit a "purchase" remain hard failures either way.
 */
export function validateBatch(input: unknown, nowMs: number, lenientEvents = false): ValidationResult {
  if (!isObj(input)) return { ok: false, error: "body must be an object" };
  const s = input.session;
  if (!isObj(s)) return { ok: false, error: "session required" };
  const sid = asUuid(s.id), vid = asUuid(s.visitor_id);
  if (!sid || !vid) return { ok: false, error: "invalid session/visitor id" };

  const session: SessionInput = {
    id: sid, visitor_id: vid,
    landing_path: sanitizePath(s.landing_path) ?? "/",
    referrer: safeReferrer(s.referrer), referrer_domain: safeHost(s.referrer_domain),
    utm_source: asToken(s.utm_source), utm_medium: asToken(s.utm_medium), utm_campaign: asToken(s.utm_campaign),
    utm_content: asToken(s.utm_content), utm_term: asToken(s.utm_term),
    is_test: s.env === "test",
  };

  const arr = (v: unknown, max: number, label: string): unknown[] | string => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) return `${label} must be an array`;
    return v.length > max ? `too many ${label}` : v;
  };

  const rawEvents = arr(input.events, LIMITS.events, "events");
  const rawViews = arr(input.page_views, LIMITS.pageViews, "page_views");
  const rawEng = arr(input.engagements, LIMITS.engagements, "engagements");
  if (typeof rawEvents === "string") return { ok: false, error: rawEvents };
  if (typeof rawViews === "string") return { ok: false, error: rawViews };
  if (typeof rawEng === "string") return { ok: false, error: rawEng };

  const events: EventInput[] = [];
  const rejected: string[] = [];
  for (const raw of rawEvents) {
    const ev = validateEvent(raw, nowMs);
    if (typeof ev === "string") {
      if (lenientEvents && !ev.startsWith("purchase")) { rejected.push(ev); continue; }
      return { ok: false, error: ev };
    }
    events.push(ev);
  }

  const page_views: PageViewInput[] = [];
  for (const raw of rawViews) {
    if (!isObj(raw)) return { ok: false, error: "page_view must be an object" };
    const id = asUuid(raw.id), path = sanitizePath(raw.path);
    if (!id || !path) return { ok: false, error: "invalid page_view" };
    page_views.push({
      id, path, page_type: pageTypeFor(path),
      odoo_template_id: asInt(raw.odoo_template_id, 1, 2_147_483_647),
      odoo_variant_id: asInt(raw.odoo_variant_id, 1, 2_147_483_647),
      category_id: asInt(raw.category_id, 1, 2_147_483_647),
      referrer_path: sanitizePath(raw.referrer_path), started_at: clampTimestamp(raw.started_at, nowMs),
    });
  }

  const engagements: EngagementInput[] = [];
  for (const raw of rawEng) {
    if (!isObj(raw)) return { ok: false, error: "engagement must be an object" };
    const pv = asUuid(raw.page_view_id), secs = asNum(raw.engaged_seconds, 0, LIMITS.maxEngagedSeconds);
    if (!pv || secs === null) return { ok: false, error: "invalid engagement" };
    engagements.push({
      page_view_id: pv, engaged_seconds: secs,
      max_scroll_percent: asInt(raw.max_scroll_percent, 0, 100) ?? 0, ended_at: clampTimestamp(raw.ended_at, nowMs),
    });
  }

  let cart: CartInput | null = null;
  if (input.cart !== undefined && input.cart !== null) {
    if (!isObj(input.cart)) return { ok: false, error: "cart must be an object" };
    const cid = asUuid(input.cart.id);
    if (!cid || !Array.isArray(input.cart.items)) return { ok: false, error: "invalid cart" };
    if (input.cart.items.length > LIMITS.cartItems) return { ok: false, error: "too many cart items" };
    const items: CartItemInput[] = [];
    for (const it of input.cart.items) {
      if (!isObj(it)) return { ok: false, error: "invalid cart item" };
      const t = asInt(it.odoo_template_id, 1, 2_147_483_647), q = asInt(it.quantity, 1, LIMITS.maxQuantity);
      const price = asNum(it.observed_unit_price, 0, LIMITS.maxValue);
      if (t === null || q === null || price === null) return { ok: false, error: "invalid cart item" };
      items.push({ odoo_template_id: t, odoo_variant_id: asInt(it.odoo_variant_id, 0, 2_147_483_647) ?? 0, quantity: q, observed_unit_price: price });
    }
    cart = { id: cid, items };
  }

  const tokenRaw = input.auth_token;
  const auth_token = typeof tokenRaw === "string" && tokenRaw.length > 20 && tokenRaw.length < 4096 ? tokenRaw : null;
  return { ok: true, batch: { session, page_views, engagements, events, cart, auth_token, rejected } };
}

// ---------------------------------------------------------------------------------------------
// User agent (coarse categories only — the raw UA is never stored)
// ---------------------------------------------------------------------------------------------
export interface ParsedUa { device_type: "mobile" | "tablet" | "desktop"; browser_family: string; os_family: string; is_bot: boolean }

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|uptime|monitor|health[-_ ]?check|statuscake|datadog|newrelic|curl\/|wget|python-requests|httpclient|node-fetch|axios|postman|facebookexternalhit|preview|vercel|gtmetrix|pagespeed/i;

export function parseUserAgent(ua: string): ParsedUa {
  const s = ua ?? "";
  const is_bot = s.length === 0 || BOT_RE.test(s);
  const isIpad = /iPad/.test(s) || (/Macintosh/.test(s) && /Mobile\//.test(s));
  const isTablet = isIpad || /Tablet|PlayBook|Silk/i.test(s) || (/Android/.test(s) && !/Mobile/.test(s));
  const isMobile = !isTablet && /Mobile|iPhone|iPod|Android/.test(s);
  const device_type = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";
  const browser_family = /Edg(e|A|iOS)?\//.test(s) ? "Edge"
    : /OPR\/|Opera/.test(s) ? "Other"
    : /Firefox\/|FxiOS\//.test(s) ? "Firefox"
    : /Chrome\/|CriOS\//.test(s) ? "Chrome"
    : /Safari\//.test(s) ? "Safari" : "Other";
  const os_family = /Android/.test(s) ? "Android"
    : /iPhone|iPad|iPod/.test(s) ? "iOS"
    : /Windows/.test(s) ? "Windows"
    : /Mac OS X|Macintosh/.test(s) ? "macOS"
    : /Linux|X11/.test(s) ? "Linux" : "Other";
  return { device_type, browser_family, os_family, is_bot };
}

// ---------------------------------------------------------------------------------------------
// Traffic source classification (first landing only — the RPC never overwrites it)
// ---------------------------------------------------------------------------------------------
const SEARCH_ENGINES = /(^|\.)(bing|duckduckgo|yahoo|yandex|ecosia|baidu|brave|startpage|ask)\./i;
const PAID_MEDIUM = /^(cpc|ppc|paid|paidsearch|paid_social|paidsocial|display|banner|affiliate)$/i;

export function classifySource(p: {
  referrer_domain: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; selfHosts?: string[];
}): string {
  const src = (p.utm_source ?? "").toLowerCase();
  const med = (p.utm_medium ?? "").toLowerCase();
  const ref = (p.referrer_domain ?? "").toLowerCase();
  const self = (p.selfHosts ?? []).some((h) => ref === h || ref.endsWith("." + h));
  const blob = `${src} ${self ? "" : ref}`;
  if (/instagram|(^|\s)ig(\s|$)|l\.instagram/.test(blob)) return "Instagram";
  if (/facebook|(^|\s)fb(\s|$)|fb\.com|l\.facebook|m\.facebook/.test(blob)) return "Facebook";
  if (/whatsapp|wa\.me/.test(blob)) return "WhatsApp";
  const googleRef = !self && /(^|\.)google\.[a-z.]+$/.test(ref);
  if (googleRef || src === "google") return PAID_MEDIUM.test(med) ? "Campaign" : "Google Organic";
  if (!self && SEARCH_ENGINES.test(ref)) return PAID_MEDIUM.test(med) ? "Campaign" : "Search";
  if (p.utm_campaign || PAID_MEDIUM.test(med) || /^(email|newsletter|sms)$/.test(med)) return "Campaign";
  if (src) return "Other";
  if (ref && !self) return "Referral";
  return "Direct";
}

// ---------------------------------------------------------------------------------------------
// Purchase payload for create-order (server-built; browsers never supply values)
// ---------------------------------------------------------------------------------------------
export function isPrivateIp(ip: string): boolean {
  return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip) || ip === "0.0.0.0";
}
