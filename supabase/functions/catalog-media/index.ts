// supabase/functions/catalog-media/index.ts
//
// GET /functions/v1/catalog-media?model=product.template&id=442&field=image_1920[&v=<write_date>]
//
// Proxies one Odoo binary image field. Only product.template/product.product/product.image/
// product.public.category + the confirmed image_*/cover_image fields are reachable — see
// _shared/odoo/media.ts's whitelist. Never a generic execute_kw proxy: model/field are checked
// against a fixed allowlist, id must be a positive integer, and rejection responses are
// deliberately vague (this is the one Odoo-touching endpoint reachable from the public internet
// with no further gating). No base64 JSON is ever returned — always raw image bytes with a real
// Content-Type.
//
// Product-image cache layer (performance pass, 2026-10-13 — see
// Documentations MD/storefront-performance-2026-10.md and
// Documentations MD/product-media-cache.md). Production profiling proved repeated requests for
// the SAME image never got a shared-cache hit (CF-Cache-Status: DYNAMIC every time, a fresh
// x-deno-execution-id every time) and that homepage-scale concurrency (10-14+ simultaneous image
// requests) multiplies Odoo's per-image latency into several seconds of tail latency. `v` (Odoo's
// write_date for that record, URL-sanitized by the caller — see buildMediaUrl in
// _shared/odoo/catalog.ts) is the cache key's version component:
//   - `v` present + a cached object already exists at that exact (model, id, field, v) path →
//     302 redirect straight to the public Supabase Storage URL. Odoo is never touched.
//   - `v` present + no cached object yet → fetch from Odoo exactly as before, serve those bytes to
//     THIS request with no added latency, then best-effort upload them to Storage (not blocking
//     the response) so every later request for the same version redirects instead.
//   - `v` absent (an older cached frontend response, or a direct/manual call) → always-live Odoo
//     proxy, byte-identical to this function's pre-cache behavior. Purely backward compatible.
// An Odoo image update changes that record's write_date, which changes `v`, which changes the
// whole URL — so a stale cached object is simply never referenced again, not invalidated in place.

import { createClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig } from "../_shared/odoo/client.ts";
import { fetchOdooMediaBytes, isWhitelistedMediaRequest } from "../_shared/odoo/media.ts";
import { buildStorageMediaPath, buildStorageMediaPublicUrl, sanitizeMediaVersion } from "../_shared/odoo/catalog.ts";
import type { MediaField, MediaModel } from "../_shared/odoo/catalog.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PRODUCT_MEDIA_BUCKET = "product-media";

/**
 * One retry on top of fetchOdooMediaBytes — a homepage load fires 10-20+ of these in parallel
 * (every curated category's cover image at once), and Odoo occasionally 502s a fraction of that
 * burst (confirmed live via Supabase edge-function logs, 2026-10-07 — several `catalog-media`
 * calls failing with "Odoo request failed" while sibling calls in the same burst succeeded).
 * `fetchOdooMediaBytes` only ever calls Odoo's `read` (never a write), so retrying it is always
 * safe — unlike `odooExecuteKw` generally, which `catalog-media` deliberately does NOT wrap here
 * since that's shared with non-idempotent write endpoints. See
 * Documentations MD/frontend-foundation-uiux-refactor.md, "Category image load glitches".
 */
async function fetchOdooMediaBytesWithRetry(
  config: Parameters<typeof fetchOdooMediaBytes>[0],
  model: MediaModel,
  id: number,
  field: MediaField
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    return await fetchOdooMediaBytes(config, model, id, field);
  } catch (err) {
    console.error("[catalog-media] first attempt failed, retrying once", err instanceof Error ? err.message : err);
    await new Promise((resolve) => setTimeout(resolve, 300));
    return fetchOdooMediaBytes(config, model, id, field);
  }
}

/** Does a cached object already exist at this exact versioned path? A plain HEAD against the
 * public URL is the simplest possible check (the bucket is public-read, no client/auth needed)
 * AND is literally the same request a browser's own <img> would make if redirected there — so a
 * "yes" here is a real guarantee, not an inference. Any error (network, Storage outage) is treated
 * as "not cached" — falls through to the live-Odoo path rather than ever failing the request. */
async function isAlreadyCached(publicUrl: string): Promise<boolean> {
  try {
    const res = await fetch(publicUrl, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Best-effort cache fill — never throws past this function, since a Storage outage must never
 * turn a working (if uncached) image into a broken one. Reuses the service-role key already
 * present in this project's secrets (no new secret required). */
async function uploadToCache(supabaseUrl: string, path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) return; // not configured — degrade to always-live-proxy, never throw
  try {
    const db = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await db.storage.from(PRODUCT_MEDIA_BUCKET).upload(path, bytes, {
      contentType,
      // Safe to cache forever: the path is content-addressed by write_date, so the SAME path
      // never legitimately changes content. An Odoo update produces a new path, not a new byte
      // sequence at this one.
      cacheControl: "31536000",
      upsert: true, // idempotent overwrite — harmless if another concurrent request already wrote this exact path
    });
    if (error) console.error("[catalog-media] cache upload failed (serving live-proxy only)", error.message);
  } catch (err) {
    console.error("[catalog-media] cache upload threw (serving live-proxy only)", err instanceof Error ? err.message : err);
  }
}

// In-isolate dedup: concurrent requests for the SAME uncached (model,id,field,v) within one warm
// isolate share a single Odoo fetch instead of each hammering Odoo independently — a real homepage
// burst can request the same product's image from two different rails at once. Not a distributed
// lock (a cold start or a different isolate can still race once), which is an accepted, practical
// tradeoff — the eventual Storage write is idempotent either way, so a rare double-fetch is wasted
// work, never a correctness problem.
const inFlightFetches = new Map<string, Promise<{ bytes: Uint8Array; contentType: string } | null>>();

function fetchOdooMediaDeduped(
  config: Parameters<typeof fetchOdooMediaBytes>[0],
  model: MediaModel,
  id: number,
  field: MediaField,
  dedupeKey: string
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const existing = inFlightFetches.get(dedupeKey);
  if (existing) return existing;
  const promise = fetchOdooMediaBytesWithRetry(config, model, id, field).finally(() => {
    inFlightFetches.delete(dedupeKey);
  });
  inFlightFetches.set(dedupeKey, promise);
  return promise;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const config = getOdooConfig();
  if (!config) return json({ error: "Catalog media not configured" }, 501);

  const url = new URL(req.url);
  const model = url.searchParams.get("model") ?? "";
  const field = (url.searchParams.get("field") || "image_1920") as MediaField;
  const idRaw = url.searchParams.get("id") ?? "";
  const id = Number(idRaw);
  const vRaw = url.searchParams.get("v");

  if (!isWhitelistedMediaRequest(model, field) || !Number.isInteger(id) || id <= 0) {
    return json({ error: "Unsupported media request" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  // Re-sanitize defensively rather than trusting the raw query value verbatim — buildMediaUrl is
  // the only intended producer of this param, but this keeps the Storage path space bounded to
  // exactly what sanitizeMediaVersion allows regardless of caller.
  const v = vRaw ? sanitizeMediaVersion(vRaw) : null;

  if (v && supabaseUrl) {
    const storagePath = buildStorageMediaPath(model as MediaModel, id, field, v);
    const publicUrl = buildStorageMediaPublicUrl(supabaseUrl, model as MediaModel, id, field, v);

    if (await isAlreadyCached(publicUrl)) {
      // A plain Response.redirect() can't carry a Cache-Control header — built manually so a
      // repeat visit within a day can skip even this redirect hop via the browser's own cache,
      // not just the Storage object it points to. Safe to cache the redirect itself aggressively:
      // this exact URL (model/id/field/v) is content-addressed, so it never legitimately points
      // anywhere else.
      return new Response(null, { status: 302, headers: { Location: publicUrl, "Cache-Control": "public, max-age=86400", ...CORS_HEADERS } });
    }

    try {
      const media = await fetchOdooMediaDeduped(config, model as MediaModel, id, field, storagePath);
      if (!media) return json({ error: "No image" }, 404);

      const uploadPromise = uploadToCache(supabaseUrl, storagePath, media.bytes, media.contentType);
      // deno-lint-ignore no-explicit-any
      const runtime = globalThis as any;
      if (typeof runtime.EdgeRuntime?.waitUntil === "function") {
        runtime.EdgeRuntime.waitUntil(uploadPromise);
      } else {
        await uploadPromise; // no background-task support in this runtime — await inline rather than risk the isolate recycling mid-upload
      }

      return new Response(media.bytes as BodyInit, {
        status: 200,
        headers: { "Content-Type": media.contentType, "Cache-Control": "public, max-age=31536000, immutable", ...CORS_HEADERS },
      });
    } catch (err) {
      return json({ error: "Failed to fetch media from Odoo" }, 502, err);
    }
  }

  // No `v` (or Storage not configured) — exactly the pre-cache behavior: always-live proxy.
  try {
    const media = await fetchOdooMediaBytesWithRetry(config, model as MediaModel, id, field);
    if (!media) return json({ error: "No image" }, 404);
    return new Response(media.bytes as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": media.contentType,
        // Product images change rarely relative to page views; a day of shared caching with a
        // long stale-while-revalidate keeps this proxy off the hot path without serving a
        // week-stale image after a real update.
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    return json({ error: "Failed to fetch media from Odoo" }, 502, err);
  }
});

function json(body: unknown, status = 200, err?: unknown): Response {
  if (err) console.error("[catalog-media]", err instanceof Error ? err.message : err);
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
