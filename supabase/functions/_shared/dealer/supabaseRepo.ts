// supabase/functions/_shared/dealer/supabaseRepo.ts
//
// Postgres implementation of DealerRepo, over the service-role client (the dealer_* tables have RLS
// enabled with no policies — see the migrations). Deno-only: imported by the Edge Functions, never by
// the browser bundle or Vitest.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { DealerError } from "./errors.ts";
import type { PublishPlan } from "./pricing.ts";
import type { DealerRepo, DealerStats, NewAccess, NewAudit, NewDealer, NewOrder, NewOrderItem, NewRule } from "./ports.ts";
import type {
  AccessRow,
  AdminGrantRow,
  AuditRow,
  BrandingRow,
  CartItemRow,
  DealerRow,
  DealerStatus,
  DealerUserRow,
  InsightItem,
  OfferRow,
  OrderItemRow,
  OrderRow,
  OrderStatus,
  PortalMode,
  PriceRuleRow,
  PriceStatus,
} from "./types.ts";

function check<T>(res: { data: T | null; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) {
    console.error(`[dealer-repo] ${what}:`, res.error.code, res.error.message);
    throw new Error(`Database error (${what})`);
  }
  return res.data as T;
}

/** Keeps PostgREST filter syntax characters out of a user-typed search term. */
function safeSearch(term: string): string {
  return term.replace(/[,()%*\\:"']/g, " ").trim().slice(0, 80);
}

export class SupabaseDealerRepo implements DealerRepo {
  db: SupabaseClient;
  constructor(db: SupabaseClient) {
    this.db = db;
  }

  async listDealers(f: { search?: string; status?: DealerStatus; offset: number; limit: number; sortBy?: "name" | "status" | "code" | "created" | "updated"; sortDir?: "asc" | "desc"; onlyIds?: string[] }) {
    const column = { name: "display_name", status: "status", code: "dealer_code", created: "created_at", updated: "updated_at" }[f.sortBy ?? "created"];
    const ascending = (f.sortDir ?? (f.sortBy ? "asc" : "desc")) === "asc";
    let q = this.db.from("dealers").select("*", { count: "exact" }).order(column, { ascending }).order("created_at", { ascending: false }).range(f.offset, f.offset + f.limit - 1);
    if (f.onlyIds) q = q.in("id", f.onlyIds.length ? f.onlyIds : ["00000000-0000-0000-0000-000000000000"]);
    if (f.status) q = q.eq("status", f.status);
    const term = f.search ? safeSearch(f.search) : "";
    if (term) q = q.or(`display_name.ilike.%${term}%,legal_name.ilike.%${term}%,dealer_code.ilike.%${term}%,contact_email.ilike.%${term}%`);
    const res = await q;
    if (res.error) check(res as never, "listDealers");
    return { rows: (res.data ?? []) as DealerRow[], total: res.count ?? 0 };
  }
  async getDealer(id: string) {
    return check(await this.db.from("dealers").select("*").eq("id", id).maybeSingle(), "getDealer") as DealerRow | null;
  }
  async insertDealer(row: NewDealer) {
    const res = await this.db.from("dealers").insert(row).select("*").single();
    if (res.error?.code === "23505") throw new DealerError("CONFLICT", "Dealer code already exists — please try again");
    return check(res, "insertDealer") as DealerRow;
  }
  async updateDealer(id: string, patch: Partial<DealerRow>) {
    const { id: _id, created_at: _c, ...rest } = patch;
    return check(await this.db.from("dealers").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id).select("*").single(), "updateDealer") as DealerRow;
  }
  async dealerStats(ids: string[]) {
    const out = new Map<string, DealerStats>();
    if (ids.length === 0) return out;
    const users = check(await this.db.from("dealer_users").select("dealer_id,email,last_login_at").in("dealer_id", ids), "dealerStats.users") as { dealer_id: string; email: string; last_login_at: string | null }[];
    await Promise.all(
      ids.map(async (id) => {
        const [count, last] = await Promise.all([
          this.db.from("dealer_product_access").select("id", { count: "exact", head: true }).eq("dealer_id", id),
          this.db.from("dealer_orders").select("created_at").eq("dealer_id", id).order("created_at", { ascending: false }).limit(1),
        ]);
        const mine = users.filter((u) => u.dealer_id === id);
        out.set(id, {
          assignedCount: count.count ?? 0,
          lastOrderAt: (last.data?.[0] as { created_at: string } | undefined)?.created_at ?? null,
          lastLoginAt: mine.map((u) => u.last_login_at).filter((x): x is string => !!x).sort().pop() ?? null,
          ownerEmail: mine[0]?.email ?? null,
        });
      })
    );
    return out;
  }
  async getBranding(dealerId: string) {
    return check(await this.db.from("dealer_branding").select("*").eq("dealer_id", dealerId).maybeSingle(), "getBranding") as BrandingRow | null;
  }
  async upsertBranding(dealerId: string, patch: Partial<Omit<BrandingRow, "dealer_id" | "updated_at">>) {
    return check(await this.db.from("dealer_branding").upsert({ dealer_id: dealerId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "dealer_id" }).select("*").single(), "upsertBranding") as BrandingRow;
  }

  async listDealerUsers(dealerId: string) {
    return check(await this.db.from("dealer_users").select("*").eq("dealer_id", dealerId), "listDealerUsers") as DealerUserRow[];
  }
  async getDealerUserByAuthId(authUserId: string) {
    return check(await this.db.from("dealer_users").select("*").eq("auth_user_id", authUserId).maybeSingle(), "getDealerUserByAuthId") as DealerUserRow | null;
  }
  async insertDealerUser(row: Omit<DealerUserRow, "id">) {
    const res = await this.db.from("dealer_users").insert(row).select("*").single();
    if (res.error?.code === "23505") throw new DealerError("CONFLICT", "That user already belongs to a dealer");
    return check(res, "insertDealerUser") as DealerUserRow;
  }
  async updateDealerUser(id: string, patch: Partial<DealerUserRow>) {
    const { id: _id, ...rest } = patch;
    return check(await this.db.from("dealer_users").update(rest).eq("id", id).select("*").single(), "updateDealerUser") as DealerUserRow;
  }

  async listAccess(dealerId: string) {
    return check(await this.db.from("dealer_product_access").select("*").eq("dealer_id", dealerId).limit(5000), "listAccess") as AccessRow[];
  }
  async upsertAccess(rows: NewAccess[]) {
    if (rows.length === 0) return;
    const stamped = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    check(await this.db.from("dealer_product_access").upsert(stamped, { onConflict: "dealer_id,odoo_variant_id" }), "upsertAccess");
  }
  async deleteAccess(dealerId: string, variantIds: number[]) {
    if (variantIds.length === 0) return;
    check(await this.db.from("dealer_product_access").delete().eq("dealer_id", dealerId).in("odoo_variant_id", variantIds), "deleteAccess");
  }

  async listRules(dealerId: string, opts?: { statuses?: PriceStatus[]; variantIds?: number[] }) {
    let q = this.db.from("dealer_price_rules").select("*").eq("dealer_id", dealerId).limit(10000);
    if (opts?.statuses) q = q.in("status", opts.statuses);
    if (opts?.variantIds) q = q.in("odoo_variant_id", opts.variantIds);
    return check(await q, "listRules") as PriceRuleRow[];
  }
  async insertRule(row: NewRule) {
    const res = await this.db.from("dealer_price_rules").insert(row).select("*").single();
    if (res.error?.code === "23P01") throw new DealerError("CONFLICT", "Overlapping active price windows for the same product are not allowed");
    return check(res, "insertRule") as PriceRuleRow;
  }
  async deleteDraftRules(dealerId: string, ids: string[]) {
    if (ids.length === 0) return;
    check(await this.db.from("dealer_price_rules").delete().eq("dealer_id", dealerId).eq("status", "draft").in("id", ids), "deleteDraftRules");
  }
  async applyPricePlan(dealerId: string, plan: PublishPlan) {
    const res = await this.db.rpc("dealer_apply_price_plan", { p_dealer_id: dealerId, p_plan: plan });
    // 23P01 = exclusion_violation: the DB-level backstop for overlapping active windows.
    if (res.error?.code === "23P01") throw new DealerError("CONFLICT", "Overlapping active price windows for the same product are not allowed");
    check(res as never, "applyPricePlan");
  }

  async listCart(dealerId: string) {
    return check(await this.db.from("dealer_cart_items").select("*").eq("dealer_id", dealerId).order("updated_at"), "listCart") as CartItemRow[];
  }
  async upsertCartItem(dealerId: string, variantId: number, quantity: number, quotedPricePaise: number | null) {
    check(await this.db.from("dealer_cart_items").upsert({ dealer_id: dealerId, odoo_variant_id: variantId, quantity, quoted_price_paise: quotedPricePaise, updated_at: new Date().toISOString() }, { onConflict: "dealer_id,odoo_variant_id" }), "upsertCartItem");
  }
  async setCartQuotedPrices(dealerId: string, prices: Map<number, number>) {
    for (const [variantId, paise] of prices) {
      check(await this.db.from("dealer_cart_items").update({ quoted_price_paise: paise }).eq("dealer_id", dealerId).eq("odoo_variant_id", variantId), "setCartQuotedPrices");
    }
  }
  async deleteCartItem(dealerId: string, variantId: number) {
    check(await this.db.from("dealer_cart_items").delete().eq("dealer_id", dealerId).eq("odoo_variant_id", variantId), "deleteCartItem");
  }
  async clearCart(dealerId: string) {
    check(await this.db.from("dealer_cart_items").delete().eq("dealer_id", dealerId), "clearCart");
  }

  async insertOrder(order: NewOrder, items: NewOrderItem[]) {
    const res = await this.db.rpc("dealer_insert_order", { p_order: order, p_items: items });
    const data = check(res as never, "insertOrder") as { created: boolean; order: OrderRow };
    return { order: data.order, created: data.created };
  }
  async getOrder(id: string) {
    return check(await this.db.from("dealer_orders").select("*").eq("id", id).maybeSingle(), "getOrder") as OrderRow | null;
  }
  async getOrderByKey(dealerId: string, key: string) {
    return check(await this.db.from("dealer_orders").select("*").eq("dealer_id", dealerId).eq("idempotency_key", key).maybeSingle(), "getOrderByKey") as OrderRow | null;
  }
  async listOrders(f: { dealerId?: string; dealerIds?: string[]; status?: OrderStatus; offset: number; limit: number }) {
    let q = this.db.from("dealer_orders").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(f.offset, f.offset + f.limit - 1);
    if (f.dealerId) q = q.eq("dealer_id", f.dealerId);
    if (f.dealerIds) q = q.in("dealer_id", f.dealerIds.length ? f.dealerIds : ["00000000-0000-0000-0000-000000000000"]);
    if (f.status) q = q.eq("status", f.status);
    const res = await q;
    if (res.error) check(res as never, "listOrders");
    return { rows: (res.data ?? []) as OrderRow[], total: res.count ?? 0 };
  }
  async listPendingSync(limit: number, dealerIds?: string[]) {
    let q = this.db.from("dealer_orders").select("*").eq("status", "pending_sync").order("created_at").limit(limit);
    if (dealerIds) q = q.in("dealer_id", dealerIds.length ? dealerIds : ["00000000-0000-0000-0000-000000000000"]);
    return check(await q, "listPendingSync") as OrderRow[];
  }
  async sumOpenOrders(dealerId: string) {
    const rows = check(await this.db.from("dealer_orders").select("total_paise").eq("dealer_id", dealerId).in("status", ["pending_sync", "quotation", "confirmed"]).limit(10000), "sumOpenOrders") as { total_paise: number }[];
    return rows.reduce((sum, r) => sum + Number(r.total_paise), 0);
  }
  async listInsightItems(dealerId: string, sinceIso: string): Promise<InsightItem[]> {
    const orders = check(await this.db.from("dealer_orders").select("id,created_at").eq("dealer_id", dealerId).neq("status", "cancelled").gte("created_at", sinceIso).limit(5000), "insights.orders") as { id: string; created_at: string }[];
    if (orders.length === 0) return [];
    const created = new Map(orders.map((o) => [o.id, o.created_at]));
    const items = check(await this.db.from("dealer_order_items").select("order_id,odoo_variant_id,product_name,quantity,line_total_paise").in("order_id", orders.map((o) => o.id)).limit(20000), "insights.items") as Omit<InsightItem, "created_at">[];
    return items.map((i) => ({ ...i, created_at: created.get(i.order_id) ?? sinceIso }));
  }
  async listOrderItems(orderId: string) {
    return check(await this.db.from("dealer_order_items").select("*").eq("order_id", orderId).order("product_name"), "listOrderItems") as OrderItemRow[];
  }
  async updateOrder(id: string, patch: Partial<OrderRow>) {
    const { id: _id, ...rest } = patch;
    return check(await this.db.from("dealer_orders").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id).select("*").single(), "updateOrder") as OrderRow;
  }
  async countOrdersByStatus(dealerId: string) {
    const rows = check(await this.db.from("dealer_orders").select("status").eq("dealer_id", dealerId).limit(10000), "countOrdersByStatus") as { status: string }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = (out[r.status] ?? 0) + 1;
    return out;
  }

  async appendAudit(entry: NewAudit) {
    const res = await this.db.from("dealer_audit_log").insert(entry);
    // An audit write failing must never take down the user's action, but it must be loud in the logs.
    if (res.error) console.error("[dealer-repo] AUDIT WRITE FAILED", entry.event_type, res.error.message);
  }
  async listAudit(f: { dealerId: string; offset: number; limit: number }) {
    const res = await this.db.from("dealer_audit_log").select("*", { count: "exact" }).eq("dealer_id", f.dealerId).order("id", { ascending: false }).range(f.offset, f.offset + f.limit - 1);
    if (res.error) check(res as never, "listAudit");
    return { rows: (res.data ?? []) as AuditRow[], total: res.count ?? 0 };
  }
  async countAudit(f: { eventTypes: string[]; sinceIso: string }) {
    const out: Record<string, number> = {};
    await Promise.all(
      f.eventTypes.map(async (type) => {
        const res = await this.db.from("dealer_audit_log").select("id", { count: "exact", head: true }).eq("event_type", type).gte("created_at", f.sinceIso);
        out[type] = res.count ?? 0;
      })
    );
    return out;
  }

  async listOffers(dealerId: string) {
    return check(await this.db.from("dealer_offers").select("*").eq("dealer_id", dealerId).order("created_at", { ascending: false }).limit(100), "listOffers") as OfferRow[];
  }
  async insertOffer(row: Omit<OfferRow, "id" | "created_at">) {
    return check(await this.db.from("dealer_offers").insert(row).select("*").single(), "insertOffer") as OfferRow;
  }
  async deleteOffer(dealerId: string, id: string) {
    check(await this.db.from("dealer_offers").delete().eq("dealer_id", dealerId).eq("id", id), "deleteOffer");
  }

  async getPortalMode(): Promise<PortalMode> {
    const res = await this.db.schema("private").from("app_config").select("value").eq("key", "dealer_portal_mode").maybeSingle();
    const v = (res.data as { value?: string } | null)?.value;
    return v === "off" || v === "on" ? v : "pilot";
  }
  async setPortalMode(mode: PortalMode) {
    check(await this.db.schema("private").from("app_config").upsert({ key: "dealer_portal_mode", value: mode, updated_at: new Date().toISOString() }, { onConflict: "key" }), "setPortalMode");
  }

  async getAdminGrant(userId: string) {
    return check(await this.db.from("dealer_admin_grants").select("*").eq("auth_user_id", userId).maybeSingle(), "getAdminGrant") as AdminGrantRow | null;
  }
  async upsertAdminGrant(row: Omit<AdminGrantRow, "updated_at">) {
    return check(await this.db.from("dealer_admin_grants").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "auth_user_id" }).select("*").single(), "upsertAdminGrant") as AdminGrantRow;
  }
  async listAdminsByRole(role: string) {
    const rows = check(await this.db.from("profiles").select("id,full_name").eq("admin_role", role).limit(200), "listAdminsByRole") as { id: string; full_name: string | null }[];
    return rows.map((r) => ({ id: r.id, fullName: r.full_name }));
  }
}
