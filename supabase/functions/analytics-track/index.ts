// supabase/functions/analytics-track/index.ts
//
// POST /functions/v1/analytics-track — the ONLY write path for storefront analytics. Public
// (verify_jwt = false, see supabase/config.toml) because anonymous visitors must be countable; it
// authenticates the *project* by requiring the publishable key, and identifies a *user* only by
// verifying a Supabase session token server-side (a browser-supplied user id is never trusted).
//
// Everything a browser sends is validated against strict schemas in _shared/analytics/core.ts
// before it reaches storage, then written atomically through analytics_ingest_batch().
// See Documentations MD/delite-analytics.md.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { classifySource, isPrivateIp, LIMITS, parseUserAgent, validateBatch } from "../_shared/analytics/core.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

let client: SupabaseClient | null = null;
function admin(): SupabaseClient | null {
  if (client) return client;
  const url = Deno.env.get("SUPABASE_URL");
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  try { key = (JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>).default ?? key; } catch { /* env not JSON */ }
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

function publicKeys(): string[] {
  let published: string[] = [];
  try { published = Object.values(JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>); } catch { /* ignore */ }
  return [Deno.env.get("SUPABASE_ANON_KEY"), ...published].filter((k): k is string => !!k);
}

// --- best-effort abuse limiter (per warm isolate; the DB dedupe is the real safety net) --------
const buckets = new Map<string, { n: number; t: number }>();
function limited(visitor: string, cost: number): boolean {
  const now = Date.now();
  const b = buckets.get(visitor);
  if (!b || now - b.t > 60_000) {
    if (buckets.size > 5000) buckets.clear();
    buckets.set(visitor, { n: cost, t: now });
    return false;
  }
  b.n += cost;
  return b.n > LIMITS.eventsPerMinutePerVisitor;
}

// --- user token verification (cached briefly to avoid a round trip per batch) ------------------
const tokenCache = new Map<string, { userId: string; exp: number }>();
async function verifyUser(token: string, db: SupabaseClient): Promise<string | null> {
  const hit = tokenCache.get(token);
  if (hit && hit.exp > Date.now()) return hit.userId;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  if (tokenCache.size > 2000) tokenCache.clear();
  tokenCache.set(token, { userId: data.user.id, exp: Date.now() + 60_000 });
  return data.user.id;
}

// --- coarse geography (country / region / city). The raw IP exists only in memory here: it is
// used for one lookup per new session, never stored, logged, or returned to any client. ---------
const geoCache = new Map<string, { at: number; v: { cc: string; name: string; region: string; city: string } | null }>();
async function lookupGeo(ip: string) {
  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.v;
  const tpl = Deno.env.get("ANALYTICS_GEO_URL") ?? "https://ipwho.is/{ip}?fields=success,country_code,country,region,city";
  let v: { cc: string; name: string; region: string; city: string } | null = null;
  try {
    const res = await fetch(tpl.replace("{ip}", encodeURIComponent(ip)), { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const g = await res.json() as Record<string, unknown>;
      if (g.success !== false) {
        const cc = String(g.country_code ?? g.countryCode ?? "").toUpperCase();
        if (/^[A-Z]{2}$/.test(cc)) {
          v = { cc, name: String(g.country ?? g.country_name ?? ""), region: String(g.region ?? g.regionName ?? ""), city: String(g.city ?? "") };
        }
      }
    }
  } catch { /* provider down / timeout: leave geography empty */ }
  if (geoCache.size > 500) geoCache.clear();
  geoCache.set(ip, { at: Date.now(), v });
  return v;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Project key: header (fetch) or query param (sendBeacon cannot set headers). It is a public key.
  const url = new URL(req.url);
  const key = req.headers.get("apikey") ?? url.searchParams.get("apikey");
  if (!key || !publicKeys().includes(key)) return json({ error: "Invalid project key" }, 401);

  const raw = await req.text();
  if (raw.length > LIMITS.bodyBytes) return json({ error: "Payload too large" }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }

  const result = validateBatch(body, Date.now(), true);
  if (!result.ok) return json({ error: result.error }, 400);
  const { batch } = result;
  const session = batch.session;

  // Test/dev traffic: an explicit env=test marker (set by the client when tracking is force-enabled
  // in dev/automation) OR any request whose Origin is a local dev host is stored as is_test and is
  // excluded from every report by default — localhost can never pollute production numbers.
  const origin = req.headers.get("origin") ?? "";
  let originHost = "";
  try { originHost = origin ? new URL(origin).hostname : ""; } catch { /* ignore */ }
  const isLocalOrigin = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.local)$/i.test(originHost);
  const isTest = session.is_test || isLocalOrigin;

  const ua = parseUserAgent(req.headers.get("user-agent") ?? "");
  if (ua.is_bot && !isTest) return json({ ok: true, ignored: "bot" }, 202);   // don't count monitors/crawlers

  const cost = batch.events.length + batch.page_views.length + 1;
  if (limited(session.visitor_id, cost)) return json({ error: "Rate limited" }, 429);

  const db = admin();
  if (!db) return json({ error: "Service unavailable" }, 503);

  // Identity: only a verified Supabase session token yields a user_id. A bad/expired token simply
  // degrades to anonymous (we'd rather keep the data than drop the batch).
  const keys = publicKeys();
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? batch.auth_token;
  let userId: string | null = null;
  if (bearer && !keys.includes(bearer)) {
    try { userId = await verifyUser(bearer, db); } catch { userId = null; }
  }

  const selfHosts = [...(Deno.env.get("ANALYTICS_SITE_HOSTS") ?? "deliteauto.com,www.deliteauto.com").split(",").map((h) => h.trim().toLowerCase()), originHost].filter(Boolean);
  const source_channel = classifySource({
    referrer_domain: session.referrer_domain, utm_source: session.utm_source, utm_medium: session.utm_medium,
    utm_campaign: session.utm_campaign, selfHosts,
  });

  const payload = {
    session: { ...session, user_id: userId, source_channel, device_type: ua.device_type, browser_family: ua.browser_family,
      os_family: ua.os_family, is_test: isTest },
    page_views: batch.page_views, engagements: batch.engagements, events: batch.events, cart: batch.cart,
  };
  // Events carry the *verified* user id at the RPC level via the session; nothing else from the
  // browser is trusted for identity.
  const { data, error } = await db.rpc("analytics_ingest_batch", { p: payload });
  if (error) {
    console.error("[analytics-track] ingest failed", error.code, error.message);
    return json({ error: "Write failed" }, 500);
  }
  if (data && data.ok === false) return json({ error: "Rejected" }, 403);

  if (data?.needs_geo && Deno.env.get("ANALYTICS_GEO_ENABLED") !== "false") {
    const ip = (req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim();
    if (ip && !isPrivateIp(ip)) {
      const job = lookupGeo(ip).then(async (g) => {
        if (g) await db.rpc("analytics_set_session_geo", { p_session: session.id, p_country_code: g.cc, p_country_name: g.name, p_region: g.region, p_city: g.city });
      }).catch(() => undefined);
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job); else await job;
    }
  }
  return json({ ok: true, ...(batch.rejected.length ? { rejected: batch.rejected.length } : {}) });
});
