// supabase/functions/_shared/dealer/deps.ts
//
// Wires the dealer engine to the real world for the Edge Functions: Postgres repo, Odoo port,
// Supabase-Auth invites and Resend notifications — plus the shared HTTP plumbing (CORS allow-list,
// structured errors, request ids, a best-effort per-isolate rate limiter). Deno-only.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getOdooConfig } from "../odoo/client.ts";
import { sendEmail } from "../email/index.ts";
import { DealerError } from "./errors.ts";
import { OdooDealerPort } from "./odooPort.ts";
import { SupabaseDealerRepo } from "./supabaseRepo.ts";
import type { AuthPort, EngineDeps, NotifierPort, OdooPort } from "./ports.ts";
import type { DealerRow, OrderItemRow, OrderRow } from "./types.ts";

const PORTAL_URL = (): string => (Deno.env.get("DEALER_PORTAL_URL") ?? "https://dealers.deliteauto.com").replace(/\/$/, "");

class UnconfiguredOdoo implements OdooPort {
  private fail(): never {
    throw new Error("Odoo is not configured");
  }
  getVariantInfo = async () => this.fail();
  searchProducts = async () => this.fail();
  templateCategories = async () => this.fail();
  findVariantsBySku = async () => this.fail();
  ensurePartner = async () => this.fail();
  createQuotation = async () => this.fail();
  getOrderStates = async () => this.fail();
}

class SupabaseInviteAuth implements AuthPort {
  db: SupabaseClient;
  constructor(db: SupabaseClient) {
    this.db = db;
  }
  async inviteDealerUser(email: string, meta: { dealerCode: string; displayName: string }) {
    const redirectTo = `${PORTAL_URL()}/invite/accept`;
    const invited = await this.db.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: meta.displayName, dealer_code: meta.dealerCode } });
    if (!invited.error && invited.data.user) return { authUserId: invited.data.user.id, existing: false };

    // Already has an account (e.g. a consumer sign-up with the same email): reuse it and send a
    // single-use password-setup link instead of a second account.
    if (/already|registered|exists/i.test(invited.error?.message ?? "")) {
      for (let page = 1; page <= 25; page++) {
        const list = await this.db.auth.admin.listUsers({ page, perPage: 200 });
        if (list.error) break;
        const found = list.data.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
        if (found) {
          await this.db.auth.resetPasswordForEmail(email, { redirectTo });
          return { authUserId: found.id, existing: true };
        }
        if (list.data.users.length < 200) break;
      }
    }
    console.error("[dealer-auth] invite failed:", invited.error?.message);
    throw new DealerError("VALIDATION", "Couldn't send the invite — check the owner email address and try again");
  }

  async sendPasswordReset(email: string) {
    const { error } = await this.db.auth.resetPasswordForEmail(email, { redirectTo: `${PORTAL_URL()}/reset-password` });
    if (error) {
      console.error("[dealer-auth] reset failed:", error.message);
      throw new DealerError("VALIDATION", "Couldn't send the reset email — please try again shortly");
    }
  }

  async revokeSessions(authUserIds: string[]) {
    // Deletes the users' sessions + refresh tokens (service-role-only SQL function), so a stolen or
    // lingering token can't be refreshed; the dealer-portal function also rejects pre-revoke tokens.
    const { error } = await this.db.rpc("dealer_revoke_sessions", { p_user_ids: authUserIds });
    if (error) {
      console.error("[dealer-auth] revoke failed:", error.message);
      throw new DealerError("VALIDATION", "Couldn't revoke the sessions — please try again");
    }
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

class ResendNotifier implements NotifierPort {
  async orderPlaced(args: { dealer: DealerRow; order: OrderRow; items: OrderItemRow[] }) {
    const { dealer, order, items } = args;
    const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
    const rows = items.map((i) => `<tr><td>${esc(i.product_name)}</td><td align="right">${i.quantity}</td><td align="right">${inr(i.unit_price_paise)}</td><td align="right">${inr(i.line_total_paise)}</td></tr>`).join("");
    await sendEmail({
      idempotencyKey: `dealer-order-${order.id}`,
      emailType: "dealer_order_placed",
      to: dealer.contact_email,
      subject: `Order ${order.order_number} received — Delite Auto`,
      html: `<p>Hello ${esc(dealer.contact_name ?? dealer.display_name)},</p><p>We've received your order <strong>${esc(order.order_number)}</strong>. Our team will confirm it shortly.</p><table cellpadding="6" style="border-collapse:collapse"><tr><th align="left">Product</th><th>Qty</th><th>Price</th><th>Total</th></tr>${rows}</table><p><strong>Total: ${inr(order.total_paise)}</strong></p>`,
    });
  }
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export function buildDeps(db: SupabaseClient): EngineDeps {
  const odooConfig = getOdooConfig();
  return {
    repo: new SupabaseDealerRepo(db),
    odoo: odooConfig ? new OdooDealerPort(odooConfig, Deno.env.get("SUPABASE_URL") ?? "") : new UnconfiguredOdoo(),
    auth: new SupabaseInviteAuth(db),
    notifier: new ResendNotifier(),
  };
}

// ---- HTTP plumbing -----------------------------------------------------------------------------

const DEFAULT_ORIGINS = ["https://dealers.deliteauto.com", "https://www.deliteauto.com", "https://deliteauto.com", "http://localhost:5173", "http://127.0.0.1:5173"];

function allowedOrigins(): string[] {
  const extra = (Deno.env.get("DEALER_ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  // Explicit allow-list — never `*` (dealer responses carry contract pricing).
  if (origin && allowedOrigins().includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function jsonResponse(req: Request, body: unknown, status = 200, requestId?: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", ...(requestId ? { "x-request-id": requestId } : {}), ...corsHeaders(req), ...extra },
  });
}

/** Re-wraps a Response from a shared helper (e.g. requireAdmin) with this function's CORS/no-store headers. */
export async function withHeaders(req: Request, res: Response, requestId: string): Promise<Response> {
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "x-request-id": requestId, ...corsHeaders(req) } });
}

export function errorResponse(req: Request, err: unknown, requestId: string): Response {
  if (err instanceof DealerError) {
    return jsonResponse(req, { error: { code: err.code, message: err.message, details: err.details } }, err.status, requestId);
  }
  console.error(`[dealer-fn] ${requestId}`, err instanceof Error ? err.stack ?? err.message : err);
  return jsonResponse(req, { error: { code: "INTERNAL", message: "Something went wrong — please try again" } }, 500, requestId);
}

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Best-effort fixed-window limiter — per warm isolate, so it throttles bursts and runaway
 * clients, not a distributed attacker (that needs an edge/WAF rule; see the docs). */
export function rateLimit(key: string, limit: number, windowMs = 60_000): void {
  const nowMs = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= nowMs) {
    buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.resetAt <= nowMs) buckets.delete(k);
    return;
  }
  bucket.count++;
  if (bucket.count > limit) throw new DealerError("RATE_LIMITED", "Too many requests — please slow down and try again in a moment");
}

export async function readJsonBody(req: Request, maxBytes = 1_600_000): Promise<{ action: string; payload: unknown }> {
  const text = await req.text();
  if (text.length > maxBytes) throw new DealerError("VALIDATION", "Request is too large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DealerError("VALIDATION", "Invalid request body");
  }
  const obj = (parsed && typeof parsed === "object" ? parsed : {}) as { action?: unknown; payload?: unknown };
  if (typeof obj.action !== "string" || obj.action.length > 60) throw new DealerError("VALIDATION", "Missing action");
  return { action: obj.action, payload: obj.payload ?? {} };
}
