// supabase/functions/_shared/dealer/ports.ts
//
// The seams between the dealer engine (all business rules) and the outside world. The engine only
// ever talks to these interfaces, which is what lets one engine run against Postgres+Odoo in the
// Edge Functions, against in-memory fakes in Vitest, and against the same fakes in the browser demo.

import type { PublishPlan } from "./pricing.ts";
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
  OdooProductSummary,
  OdooVariantInfo,
  OrderItemRow,
  OrderRow,
  OfferRow,
  OrderStatus,
  PortalMode,
  PriceRuleRow,
  PriceStatus,
} from "./types.ts";

export interface DealerStats {
  assignedCount: number;
  lastOrderAt: string | null;
  lastLoginAt: string | null;
  ownerEmail: string | null;
}

export type NewDealer = Omit<DealerRow, "id" | "created_at" | "updated_at">;
export type NewRule = Omit<PriceRuleRow, "id" | "created_at" | "updated_at" | "version">;
export type NewAccess = Omit<AccessRow, "id" | "updated_at">;
export type NewOrder = Omit<OrderRow, "id" | "order_number" | "created_at" | "updated_at">;
export type NewOrderItem = Omit<OrderItemRow, "id" | "order_id">;
export type NewAudit = Omit<AuditRow, "id" | "created_at">;

export interface DealerRepo {
  listDealers(f: { search?: string; status?: DealerStatus; offset: number; limit: number; sortBy?: "name" | "status" | "code" | "created" | "updated"; sortDir?: "asc" | "desc"; onlyIds?: string[] }): Promise<{ rows: DealerRow[]; total: number }>;
  getDealer(id: string): Promise<DealerRow | null>;
  insertDealer(row: NewDealer): Promise<DealerRow>;
  updateDealer(id: string, patch: Partial<DealerRow>): Promise<DealerRow>;
  dealerStats(ids: string[]): Promise<Map<string, DealerStats>>;
  getBranding(dealerId: string): Promise<BrandingRow | null>;
  upsertBranding(dealerId: string, patch: Partial<Omit<BrandingRow, "dealer_id" | "updated_at">>): Promise<BrandingRow>;

  listDealerUsers(dealerId: string): Promise<DealerUserRow[]>;
  getDealerUserByAuthId(authUserId: string): Promise<DealerUserRow | null>;
  insertDealerUser(row: Omit<DealerUserRow, "id">): Promise<DealerUserRow>;
  updateDealerUser(id: string, patch: Partial<DealerUserRow>): Promise<DealerUserRow>;

  listAccess(dealerId: string): Promise<AccessRow[]>;
  /** Upsert keyed by (dealer_id, odoo_variant_id). */
  upsertAccess(rows: NewAccess[]): Promise<void>;
  deleteAccess(dealerId: string, variantIds: number[]): Promise<void>;

  listRules(dealerId: string, opts?: { statuses?: PriceStatus[]; variantIds?: number[] }): Promise<PriceRuleRow[]>;
  insertRule(row: NewRule): Promise<PriceRuleRow>;
  /** Only ever deletes DRAFT rules (published history is immutable). */
  deleteDraftRules(dealerId: string, ids: string[]): Promise<void>;
  applyPricePlan(dealerId: string, plan: PublishPlan): Promise<void>;

  listCart(dealerId: string): Promise<CartItemRow[]>;
  upsertCartItem(dealerId: string, variantId: number, quantity: number, quotedPricePaise: number | null): Promise<void>;
  setCartQuotedPrices(dealerId: string, prices: Map<number, number>): Promise<void>;
  deleteCartItem(dealerId: string, variantId: number): Promise<void>;
  clearCart(dealerId: string): Promise<void>;

  /** Returns the existing order when (dealer_id, idempotency_key) already exists (created=false). */
  insertOrder(order: NewOrder, items: NewOrderItem[]): Promise<{ order: OrderRow; created: boolean }>;
  getOrder(id: string): Promise<OrderRow | null>;
  getOrderByKey(dealerId: string, key: string): Promise<OrderRow | null>;
  listOrders(f: { dealerId?: string; dealerIds?: string[]; status?: OrderStatus; offset: number; limit: number }): Promise<{ rows: OrderRow[]; total: number }>;
  /** Orders stored in Delite but not yet created in Odoo, oldest first. */
  listPendingSync(limit: number, dealerIds?: string[]): Promise<OrderRow[]>;
  /** Sum of totals of orders that are still open (pending_sync / quotation / confirmed) — drives the credit limit. */
  sumOpenOrders(dealerId: string): Promise<number>;
  /** Line items of non-cancelled orders since `sinceIso` — drives dealer spend insights. */
  listInsightItems(dealerId: string, sinceIso: string): Promise<InsightItem[]>;
  listOrderItems(orderId: string): Promise<OrderItemRow[]>;
  updateOrder(id: string, patch: Partial<OrderRow>): Promise<OrderRow>;
  countOrdersByStatus(dealerId: string): Promise<Record<string, number>>;

  appendAudit(entry: NewAudit): Promise<void>;
  listAudit(f: { dealerId: string; offset: number; limit: number }): Promise<{ rows: AuditRow[]; total: number }>;
  countAudit(f: { eventTypes: string[]; sinceIso: string }): Promise<Record<string, number>>;

  listOffers(dealerId: string): Promise<OfferRow[]>;
  insertOffer(row: Omit<OfferRow, "id" | "created_at">): Promise<OfferRow>;
  deleteOffer(dealerId: string, id: string): Promise<void>;

  getPortalMode(): Promise<PortalMode>;
  setPortalMode(mode: PortalMode): Promise<void>;

  getAdminGrant(userId: string): Promise<AdminGrantRow | null>;
  upsertAdminGrant(row: Omit<AdminGrantRow, "updated_at">): Promise<AdminGrantRow>;
  /** Admin accounts holding `role` (for the grants screen). */
  listAdminsByRole(role: string): Promise<{ id: string; fullName: string | null }[]>;
}

export interface OdooPort {
  /** Live facts per variant id; ids Odoo doesn't know are simply absent from the map. */
  getVariantInfo(variantIds: number[]): Promise<Map<number, OdooVariantInfo>>;
  /** Published/sellable products only. `templateIds` restricts the search server-side (scoping). */
  searchProducts(q: { text?: string; templateIds?: number[]; excludeTemplateIds?: number[]; offset: number; limit: number }): Promise<{ items: OdooProductSummary[]; total: number }>;
  /** Public categories per product template (one batched read) — for the dealer's category navigation. */
  templateCategories(templateIds: number[]): Promise<Map<number, { id: number; name: string }[]>>;
  findVariantsBySku(skus: string[]): Promise<Map<string, OdooVariantInfo[]>>;
  ensurePartner(dealer: DealerRow): Promise<number>;
  createQuotation(args: {
    partnerId: number;
    clientOrderRef: string;
    lines: { variantId: number; quantity: number; unitPrice: number }[];
    note?: string;
  }): Promise<{ saleOrderId: number; name: string; amountTotal: number }>;
  getOrderStates(ids: number[]): Promise<Map<number, { state: string; amountTotalPaise: number }>>;
}

export interface AuthPort {
  /** Creates (or finds) the auth user and emails a single-use, expiring invite/setup link. */
  inviteDealerUser(email: string, meta: { dealerCode: string; displayName: string }): Promise<{ authUserId: string; existing: boolean }>;
  /** Single-use password reset email (spec §3.1 / FR-01). */
  sendPasswordReset(email: string): Promise<void>;
  /** Ends every Supabase session of these users (refresh tokens deleted) — spec FR-01 "session revoke". */
  revokeSessions(authUserIds: string[]): Promise<void>;
}

export interface NotifierPort {
  orderPlaced(args: { dealer: DealerRow; order: OrderRow; items: OrderItemRow[] }): Promise<void>;
}

export interface EngineDeps {
  repo: DealerRepo;
  odoo: OdooPort;
  auth: AuthPort;
  notifier?: NotifierPort;
  now?: () => Date;
  /** Injectable for deterministic tests. */
  random?: () => number;
}
