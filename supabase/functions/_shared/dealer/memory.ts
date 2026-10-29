// supabase/functions/_shared/dealer/memory.ts
//
// In-memory implementations of every port: a repository that mirrors the Postgres constraints
// (uniques, the overlap exclusion, immutable audit), a fake Odoo with a small realistic catalogue,
// and a fake auth/invite port. Used only by the Vitest end-to-end suite
// — the SAME engine runs against these and against Postgres+Odoo. TEST-ONLY: never imported by the Edge
// Functions or the browser bundle.

import { DealerError } from "./errors.ts";
import { windowsOverlap, type PublishPlan } from "./pricing.ts";
import type {
  AuthPort,
  DealerRepo,
  DealerStats,
  NewAccess,
  NewAudit,
  NewDealer,
  NewOrder,
  NewOrderItem,
  NewRule,
  NotifierPort,
  OdooPort,
} from "./ports.ts";
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

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

export interface MemoryState {
  dealers: DealerRow[];
  users: DealerUserRow[];
  branding: BrandingRow[];
  access: AccessRow[];
  rules: PriceRuleRow[];
  cart: CartItemRow[];
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  audit: AuditRow[];
  orderSeq: number;
  auditSeq: number;
  offers: OfferRow[];
  grants: AdminGrantRow[];
  /** Admin accounts known to the test harness (id, name, role) for the grants screen. */
  admins: { id: string; fullName: string | null; role: string }[];
  portalMode: PortalMode;
}

export function emptyState(): MemoryState {
  return { dealers: [], users: [], branding: [], access: [], rules: [], cart: [], orders: [], orderItems: [], audit: [], orderSeq: 1000, auditSeq: 0, offers: [], grants: [], admins: [], portalMode: "on" };
}

export class MemoryRepo implements DealerRepo {
  state: MemoryState;
  clock: () => Date;
  constructor(state: MemoryState = emptyState(), clock: () => Date = () => new Date()) {
    this.state = state;
    this.clock = clock;
  }
  private ts(): string {
    return this.clock().toISOString();
  }

  async listDealers(f: { search?: string; status?: DealerStatus; offset: number; limit: number; sortBy?: "name" | "status" | "code" | "created" | "updated"; sortDir?: "asc" | "desc"; onlyIds?: string[] }) {
    const q = (f.search ?? "").toLowerCase();
    const key: Record<string, (d: DealerRow) => string> = { name: (d) => d.display_name.toLowerCase(), status: (d) => d.status, code: (d) => d.dealer_code, created: (d) => d.created_at, updated: (d) => d.updated_at };
    const pick = key[f.sortBy ?? "created"] ?? key.created;
    const sign = (f.sortDir ?? (f.sortBy ? "asc" : "desc")) === "asc" ? 1 : -1;
    const all = this.state.dealers
      .filter((d) => (!f.onlyIds || f.onlyIds.includes(d.id)) && (!f.status || d.status === f.status) && (!q || d.display_name.toLowerCase().includes(q) || d.legal_name.toLowerCase().includes(q) || d.dealer_code.toLowerCase().includes(q) || d.contact_email.toLowerCase().includes(q)))
      .sort((a, b) => sign * pick(a).localeCompare(pick(b)));
    return { rows: all.slice(f.offset, f.offset + f.limit), total: all.length };
  }
  async getDealer(id: string) {
    return this.state.dealers.find((d) => d.id === id) ?? null;
  }
  async insertDealer(row: NewDealer) {
    if (this.state.dealers.some((d) => d.dealer_code === row.dealer_code)) throw new DealerError("CONFLICT", "Dealer code already exists — try again");
    const dealer: DealerRow = { ...row, id: uuid(), created_at: this.ts(), updated_at: this.ts() };
    this.state.dealers.push(dealer);
    return dealer;
  }
  async updateDealer(id: string, patch: Partial<DealerRow>) {
    const idx = this.state.dealers.findIndex((d) => d.id === id);
    if (idx < 0) throw new DealerError("NOT_FOUND", "Dealer not found");
    // Strictly monotonic so optimistic-lock tokens always change, even within one millisecond.
    const prev = this.state.dealers[idx].updated_at;
    let next = this.ts();
    if (next <= prev) next = new Date(Date.parse(prev) + 1).toISOString();
    this.state.dealers[idx] = { ...this.state.dealers[idx], ...patch, updated_at: next };
    return this.state.dealers[idx];
  }
  async dealerStats(ids: string[]) {
    const out = new Map<string, DealerStats>();
    for (const id of ids) {
      const users = this.state.users.filter((u) => u.dealer_id === id);
      const orders = this.state.orders.filter((o) => o.dealer_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at));
      out.set(id, {
        assignedCount: this.state.access.filter((a) => a.dealer_id === id).length,
        lastOrderAt: orders[0]?.created_at ?? null,
        lastLoginAt: users.map((u) => u.last_login_at).filter((x): x is string => !!x).sort().pop() ?? null,
        ownerEmail: users[0]?.email ?? null,
      });
    }
    return out;
  }
  async getBranding(dealerId: string) {
    return this.state.branding.find((b) => b.dealer_id === dealerId) ?? null;
  }
  async upsertBranding(dealerId: string, patch: Partial<Omit<BrandingRow, "dealer_id" | "updated_at">>) {
    let row = this.state.branding.find((b) => b.dealer_id === dealerId);
    if (!row) {
      row = { dealer_id: dealerId, logo_path: null, cover_path: null, accent_color: "#10148F", tagline: null, welcome_text: null, show_public_price: false, updated_at: this.ts() };
      this.state.branding.push(row);
    }
    Object.assign(row, patch, { updated_at: this.ts() });
    return row;
  }

  async listDealerUsers(dealerId: string) {
    return this.state.users.filter((u) => u.dealer_id === dealerId);
  }
  async getDealerUserByAuthId(authUserId: string) {
    return this.state.users.find((u) => u.auth_user_id === authUserId) ?? null;
  }
  async insertDealerUser(row: Omit<DealerUserRow, "id">) {
    if (this.state.users.some((u) => u.auth_user_id === row.auth_user_id)) throw new DealerError("CONFLICT", "That user already belongs to a dealer");
    const user: DealerUserRow = { ...row, id: uuid() };
    this.state.users.push(user);
    return user;
  }
  async updateDealerUser(id: string, patch: Partial<DealerUserRow>) {
    const idx = this.state.users.findIndex((u) => u.id === id);
    if (idx < 0) throw new DealerError("NOT_FOUND", "Dealer user not found");
    this.state.users[idx] = { ...this.state.users[idx], ...patch };
    return this.state.users[idx];
  }

  async listAccess(dealerId: string) {
    return this.state.access.filter((a) => a.dealer_id === dealerId);
  }
  async upsertAccess(rows: NewAccess[]) {
    for (const row of rows) {
      const idx = this.state.access.findIndex((a) => a.dealer_id === row.dealer_id && a.odoo_variant_id === row.odoo_variant_id);
      if (idx >= 0) this.state.access[idx] = { ...this.state.access[idx], ...row, updated_at: this.ts() };
      else this.state.access.push({ ...row, id: uuid(), updated_at: this.ts() });
    }
  }
  async deleteAccess(dealerId: string, variantIds: number[]) {
    this.state.access = this.state.access.filter((a) => !(a.dealer_id === dealerId && variantIds.includes(a.odoo_variant_id)));
  }

  async listRules(dealerId: string, opts?: { statuses?: PriceStatus[]; variantIds?: number[] }) {
    return this.state.rules.filter((r) => r.dealer_id === dealerId && (!opts?.statuses || opts.statuses.includes(r.status)) && (!opts?.variantIds || opts.variantIds.includes(r.odoo_variant_id)));
  }
  async insertRule(row: NewRule) {
    if (!(row.unit_price_paise > 0)) throw new DealerError("VALIDATION", "Price must be positive");
    const rule: PriceRuleRow = { ...row, id: uuid(), version: 1, created_at: this.ts(), updated_at: this.ts() };
    this.assertNoActiveOverlap(rule);
    this.state.rules.push(rule);
    return rule;
  }
  private assertNoActiveOverlap(rule: PriceRuleRow): void {
    if (rule.status !== "active") return;
    const clash = this.state.rules.some((r) => r.id !== rule.id && r.status === "active" && r.dealer_id === rule.dealer_id && r.odoo_variant_id === rule.odoo_variant_id && r.min_quantity === rule.min_quantity && windowsOverlap(r, rule));
    if (clash) throw new DealerError("CONFLICT", "Overlapping active price windows for the same product are not allowed");
  }
  async deleteDraftRules(dealerId: string, ids: string[]) {
    this.state.rules = this.state.rules.filter((r) => !(r.dealer_id === dealerId && r.status === "draft" && ids.includes(r.id)));
  }
  async applyPricePlan(dealerId: string, plan: PublishPlan) {
    // Atomic like the SQL function: validate first on a copy, then commit.
    const next = this.state.rules.map((r) => ({ ...r }));
    for (const r of next) {
      if (r.dealer_id === dealerId && r.status === "active" && plan.expireIds.includes(r.id)) Object.assign(r, { status: "expired", ends_at: plan.at, version: r.version + 1, updated_at: this.ts() });
    }
    for (const a of plan.activate) {
      const r = next.find((x) => x.id === a.id && x.dealer_id === dealerId && x.status === "draft");
      if (r) Object.assign(r, { status: "active", starts_at: a.startsAt, ends_at: a.endsAt, version: r.version + 1, updated_at: this.ts() });
    }
    const actives = next.filter((r) => r.status === "active" && r.dealer_id === dealerId);
    for (let i = 0; i < actives.length; i++) {
      for (let j = i + 1; j < actives.length; j++) {
        if (actives[i].odoo_variant_id === actives[j].odoo_variant_id && actives[i].min_quantity === actives[j].min_quantity && windowsOverlap(actives[i], actives[j])) {
          throw new DealerError("CONFLICT", "Overlapping active price windows for the same product are not allowed");
        }
      }
    }
    this.state.rules = next;
  }

  async listCart(dealerId: string) {
    return this.state.cart.filter((c) => c.dealer_id === dealerId);
  }
  async upsertCartItem(dealerId: string, variantId: number, quantity: number, quotedPricePaise: number | null) {
    const row = this.state.cart.find((c) => c.dealer_id === dealerId && c.odoo_variant_id === variantId);
    if (row) Object.assign(row, { quantity, quoted_price_paise: quotedPricePaise, updated_at: this.ts() });
    else this.state.cart.push({ id: uuid(), dealer_id: dealerId, odoo_variant_id: variantId, quantity, quoted_price_paise: quotedPricePaise, updated_at: this.ts() });
  }
  async setCartQuotedPrices(dealerId: string, prices: Map<number, number>) {
    for (const c of this.state.cart) if (c.dealer_id === dealerId && prices.has(c.odoo_variant_id)) c.quoted_price_paise = prices.get(c.odoo_variant_id)!;
  }
  async deleteCartItem(dealerId: string, variantId: number) {
    this.state.cart = this.state.cart.filter((c) => !(c.dealer_id === dealerId && c.odoo_variant_id === variantId));
  }
  async clearCart(dealerId: string) {
    this.state.cart = this.state.cart.filter((c) => c.dealer_id !== dealerId);
  }

  async insertOrder(order: NewOrder, items: NewOrderItem[]) {
    const existing = this.state.orders.find((o) => o.dealer_id === order.dealer_id && o.idempotency_key === order.idempotency_key);
    if (existing) return { order: existing, created: false };
    const row: OrderRow = { ...order, id: uuid(), order_number: `DLR-${String(this.state.orderSeq++).padStart(6, "0")}`, created_at: this.ts(), updated_at: this.ts() };
    this.state.orders.push(row);
    for (const item of items) this.state.orderItems.push({ ...item, id: uuid(), order_id: row.id });
    return { order: row, created: true };
  }
  async getOrder(id: string) {
    return this.state.orders.find((o) => o.id === id) ?? null;
  }
  async getOrderByKey(dealerId: string, key: string) {
    return this.state.orders.find((o) => o.dealer_id === dealerId && o.idempotency_key === key) ?? null;
  }
  async listOrders(f: { dealerId?: string; dealerIds?: string[]; status?: OrderStatus; offset: number; limit: number }) {
    const all = this.state.orders.filter((o) => (!f.dealerId || o.dealer_id === f.dealerId) && (!f.dealerIds || f.dealerIds.includes(o.dealer_id)) && (!f.status || o.status === f.status)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { rows: all.slice(f.offset, f.offset + f.limit), total: all.length };
  }
  async listPendingSync(limit: number, dealerIds?: string[]) {
    return this.state.orders.filter((o) => o.status === "pending_sync" && (!dealerIds || dealerIds.includes(o.dealer_id))).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, limit);
  }
  async sumOpenOrders(dealerId: string) {
    return this.state.orders.filter((o) => o.dealer_id === dealerId && (o.status === "pending_sync" || o.status === "quotation" || o.status === "confirmed")).reduce((sum, o) => sum + o.total_paise, 0);
  }
  async listInsightItems(dealerId: string, sinceIso: string): Promise<InsightItem[]> {
    const orders = this.state.orders.filter((o) => o.dealer_id === dealerId && o.status !== "cancelled" && o.created_at >= sinceIso);
    const out: InsightItem[] = [];
    for (const o of orders) for (const i of this.state.orderItems.filter((x) => x.order_id === o.id)) out.push({ order_id: o.id, created_at: o.created_at, odoo_variant_id: i.odoo_variant_id, product_name: i.product_name, quantity: i.quantity, line_total_paise: i.line_total_paise });
    return out;
  }
  async listOrderItems(orderId: string) {
    return this.state.orderItems.filter((i) => i.order_id === orderId);
  }
  async updateOrder(id: string, patch: Partial<OrderRow>) {
    const idx = this.state.orders.findIndex((o) => o.id === id);
    if (idx < 0) throw new DealerError("NOT_FOUND", "Order not found");
    this.state.orders[idx] = { ...this.state.orders[idx], ...patch, updated_at: this.ts() };
    return this.state.orders[idx];
  }
  async countOrdersByStatus(dealerId: string) {
    const out: Record<string, number> = {};
    for (const o of this.state.orders) if (o.dealer_id === dealerId) out[o.status] = (out[o.status] ?? 0) + 1;
    return out;
  }

  async appendAudit(entry: NewAudit) {
    this.state.audit.push({ ...entry, id: ++this.state.auditSeq, created_at: this.ts() });
  }
  async listAudit(f: { dealerId: string; offset: number; limit: number }) {
    const all = this.state.audit.filter((a) => a.dealer_id === f.dealerId).sort((a, b) => b.id - a.id);
    return { rows: all.slice(f.offset, f.offset + f.limit), total: all.length };
  }
  async countAudit(f: { eventTypes: string[]; sinceIso: string }) {
    const out: Record<string, number> = {};
    for (const a of this.state.audit) if (f.eventTypes.includes(a.event_type) && a.created_at >= f.sinceIso) out[a.event_type] = (out[a.event_type] ?? 0) + 1;
    return out;
  }

  async listOffers(dealerId: string) {
    return this.state.offers.filter((o) => o.dealer_id === dealerId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async insertOffer(row: Omit<OfferRow, "id" | "created_at">) {
    const offer: OfferRow = { ...row, id: uuid(), created_at: this.ts() };
    this.state.offers.push(offer);
    return offer;
  }
  async deleteOffer(dealerId: string, id: string) {
    this.state.offers = this.state.offers.filter((o) => !(o.dealer_id === dealerId && o.id === id));
  }

  async getPortalMode() {
    return this.state.portalMode;
  }
  async setPortalMode(mode: PortalMode) {
    this.state.portalMode = mode;
  }

  async getAdminGrant(userId: string) {
    return this.state.grants.find((g) => g.auth_user_id === userId) ?? null;
  }
  async upsertAdminGrant(row: Omit<AdminGrantRow, "updated_at">) {
    const next: AdminGrantRow = { ...row, updated_at: this.ts() };
    const idx = this.state.grants.findIndex((g) => g.auth_user_id === row.auth_user_id);
    if (idx >= 0) this.state.grants[idx] = next;
    else this.state.grants.push(next);
    return next;
  }
  async listAdminsByRole(role: string) {
    return this.state.admins.filter((a) => a.role === role).map((a) => ({ id: a.id, fullName: a.fullName }));
  }
}

// -------------------------------------------------------------------------------------------------
// Fake Odoo
// -------------------------------------------------------------------------------------------------

interface FakeProduct {
  templateId: number;
  name: string;
  sku: string;
  category: string;
  publicPrice: number;
  published: boolean;
  variants: { variantId: number; sku: string; attrs: { attribute: string; value: string }[] }[];
}

const GST_18 = { id: 1, amount: 18, amount_type: "percent" as const, price_include: false };

export const FAKE_CATALOGUE: FakeProduct[] = [
  { templateId: 101, name: "Maruti Baleno Floor Mats", sku: "MAT-BAL", category: "Car Mats", publicPrice: 5000, published: true, variants: [{ variantId: 1011, sku: "MAT-BAL-BLK", attrs: [{ attribute: "Colour", value: "Black" }] }, { variantId: 1012, sku: "MAT-BAL-BEI", attrs: [{ attribute: "Colour", value: "Beige" }] }] },
  { templateId: 102, name: "LED Headlamp Set H4", sku: "LED-H4", category: "Lighting", publicPrice: 8000, published: true, variants: [{ variantId: 1021, sku: "LED-H4", attrs: [] }] },
  { templateId: 103, name: "Premium Leather Seat Cover (Creta)", sku: "SC-CRE", category: "Seat Covers", publicPrice: 12000, published: true, variants: [{ variantId: 1031, sku: "SC-CRE", attrs: [] }] },
  { templateId: 104, name: "Bike Handle Grips Pair", sku: "HG-PR", category: "Handle Grips", publicPrice: 650, published: true, variants: [{ variantId: 1041, sku: "HG-PR-RED", attrs: [{ attribute: "Colour", value: "Red" }] }, { variantId: 1042, sku: "HG-PR-BLK", attrs: [{ attribute: "Colour", value: "Black" }] }] },
  { templateId: 105, name: "Car Dash Camera 4K", sku: "DC-4K", category: "Electronics", publicPrice: 9500, published: true, variants: [{ variantId: 1051, sku: "DC-4K", attrs: [] }] },
  { templateId: 106, name: "Microfibre Cleaning Kit", sku: "CK-MF", category: "Car Care", publicPrice: 799, published: true, variants: [{ variantId: 1061, sku: "CK-MF", attrs: [] }] },
  { templateId: 107, name: "Alloy Wheel Cleaner 1L", sku: "WC-1L", category: "Car Care", publicPrice: 450, published: true, variants: [{ variantId: 1071, sku: "WC-1L", attrs: [] }] },
  { templateId: 108, name: "Steering Wheel Cover", sku: "SW-CV", category: "Interior", publicPrice: 1200, published: true, variants: [{ variantId: 1081, sku: "SW-CV", attrs: [] }] },
  { templateId: 109, name: "Discontinued Spoiler", sku: "SP-OLD", category: "Exterior", publicPrice: 3000, published: false, variants: [{ variantId: 1091, sku: "SP-OLD", attrs: [] }] },
];

export class FakeOdoo implements OdooPort {
  products: FakeProduct[] = FAKE_CATALOGUE.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v })) }));
  down = false;
  partners = new Map<string, number>();
  quotations: { id: number; name: string; state: string; partnerId: number; ref: string; amountTotal: number; lines: { variantId: number; quantity: number; unitPrice: number }[] }[] = [];
  /** Test hook: when true the fake store tracks inventory and `stock` decides in/out of stock. */
  inventoryTracked = false;
  stock = new Map<number, number>();
  nextId = 5000;
  /** Test hooks. */
  setTaxes: typeof GST_18[] = [GST_18];

  private guard(): void {
    if (this.down) throw new Error("Odoo is unreachable");
  }
  private toInfo(p: FakeProduct, v: FakeProduct["variants"][number]): OdooVariantInfo {
    return {
      variantId: v.variantId,
      templateId: p.templateId,
      name: v.attrs.length ? `${p.name} (${v.attrs.map((a) => a.value).join(", ")})` : p.name,
      sku: v.sku,
      publicPricePaise: Math.round(p.publicPrice * 100),
      purchasable: p.published,
      taxes: this.setTaxes.map((t) => ({ ...t })),
      attributes: v.attrs,
      inventoryTracked: this.inventoryTracked,
      inStock: this.inventoryTracked ? (this.stock.get(v.variantId) ?? 0) > 0 : undefined,
    };
  }
  async getVariantInfo(variantIds: number[]) {
    this.guard();
    const out = new Map<number, OdooVariantInfo>();
    for (const p of this.products) for (const v of p.variants) if (variantIds.includes(v.variantId)) out.set(v.variantId, this.toInfo(p, v));
    return out;
  }
  async searchProducts(q: { text?: string; templateIds?: number[]; excludeTemplateIds?: number[]; offset: number; limit: number }) {
    this.guard();
    const text = (q.text ?? "").toLowerCase();
    const all = this.products.filter((p) => p.published && (!q.templateIds || q.templateIds.includes(p.templateId)) && !(q.excludeTemplateIds ?? []).includes(p.templateId) && (!text || p.name.toLowerCase().includes(text) || p.sku.toLowerCase().includes(text) || p.variants.some((v) => v.sku.toLowerCase().includes(text))));
    const items: OdooProductSummary[] = all.slice(q.offset, q.offset + q.limit).map((p) => ({
      templateId: p.templateId,
      name: p.name,
      sku: p.sku,
      imageUrl: null,
      categories: [p.category],
      description: `${p.name} — genuine accessory.`,
      variants: p.variants.map((v) => this.toInfo(p, v)),
    }));
    return { items, total: all.length };
  }
  async templateCategories(templateIds: number[]) {
    this.guard();
    const out = new Map<number, { id: number; name: string }[]>();
    const ids = new Map<string, number>();
    for (const p of this.products) {
      if (!ids.has(p.category)) ids.set(p.category, 100 + ids.size);
      if (templateIds.includes(p.templateId)) out.set(p.templateId, [{ id: ids.get(p.category)!, name: p.category }]);
    }
    return out;
  }
  async findVariantsBySku(skus: string[]) {
    this.guard();
    const out = new Map<string, OdooVariantInfo[]>();
    for (const sku of skus) {
      const hits: OdooVariantInfo[] = [];
      for (const p of this.products) for (const v of p.variants) if (v.sku.toLowerCase() === sku.toLowerCase()) hits.push(this.toInfo(p, v));
      // Template-level reference: matches every variant of that template (ambiguous if several).
      if (hits.length === 0) for (const p of this.products) if (p.sku.toLowerCase() === sku.toLowerCase()) hits.push(...p.variants.map((v) => this.toInfo(p, v)));
      out.set(sku, hits);
    }
    return out;
  }
  async ensurePartner(dealer: DealerRow) {
    this.guard();
    const existing = this.partners.get(dealer.dealer_code);
    if (existing) return existing;
    const id = this.nextId++;
    this.partners.set(dealer.dealer_code, id);
    return id;
  }
  async createQuotation(args: { partnerId: number; clientOrderRef: string; lines: { variantId: number; quantity: number; unitPrice: number }[] }) {
    this.guard();
    const id = this.nextId++;
    const name = `S${String(id).padStart(5, "0")}`;
    // Like Odoo's amount_total: the lines plus tax (the fake's taxes are tax-excluded percent taxes).
    const rate = this.setTaxes.reduce((sum, t) => sum + t.amount, 0) / 100;
    const amountTotal = Math.round(args.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * (1 + rate) * 100) / 100;
    this.quotations.push({ id, name, state: "draft", partnerId: args.partnerId, ref: args.clientOrderRef, amountTotal, lines: args.lines });
    return { saleOrderId: id, name, amountTotal };
  }
  async getOrderStates(ids: number[]) {
    this.guard();
    return new Map(this.quotations.filter((q) => ids.includes(q.id)).map((q) => [q.id, { state: q.state, amountTotalPaise: Math.round(q.amountTotal * 100) }]));
  }
}

export class FakeAuth implements AuthPort {
  users = new Map<string, string>();
  invites: { email: string; at: string }[] = [];
  resets: string[] = [];
  revoked: string[][] = [];
  async inviteDealerUser(email: string) {
    const key = email.toLowerCase();
    const existing = this.users.has(key);
    if (!existing) this.users.set(key, uuid());
    this.invites.push({ email: key, at: new Date().toISOString() });
    return { authUserId: this.users.get(key)!, existing };
  }
  async sendPasswordReset(email: string) {
    this.resets.push(email.toLowerCase());
  }
  async revokeSessions(authUserIds: string[]) {
    this.revoked.push(authUserIds);
  }
}

export class RecordingNotifier implements NotifierPort {
  sent: { orderNumber: string; dealer: string }[] = [];
  async orderPlaced(args: { dealer: DealerRow; order: OrderRow }) {
    this.sent.push({ orderNumber: args.order.order_number, dealer: args.dealer.display_name });
  }
}
