// supabase/functions/_shared/dealer/engine.ts
//
// The dealer-portal business engine. ALL rules live here — tenant isolation, entitlement vs price,
// publish/overlap, quoting, idempotent ordering, audit — behind the ports in ports.ts. The Edge
// Functions authenticate the caller and hand this engine a trusted identity; the engine never
// accepts a dealer id from a dealer-facing payload.
// See Documentations MD/dealer-portal.md.

import { DealerError } from "./errors.ts";
import {
  adjustPaiseByPercent,
  checkReadiness,
  planPublish,
  resolveActiveRule,
  rupeesToPaise,
  validatePriceInput,
} from "./pricing.ts";
import { parsePriceCsv } from "./csv.ts";
import { buildDealerQuote, computeLineMoney, type DealerQuote, type DealerQuoteLine } from "./quote.ts";
import {
  asPayload,
  intArray,
  optBool,
  optGstin,
  optInt,
  optMediaPath,
  optPhone,
  optStr,
  pageParams,
  parseAddress,
  reqAccent,
  reqEmail,
  reqInt,
  reqStr,
  reqUuid,
  validIdempotencyKey,
  type Payload,
} from "./payload.ts";
import type { EngineDeps } from "./ports.ts";
import type {
  AccessRow,
  Address,
  DealerRow,
  DealerStatus,
  DealerUserRow,
  OdooProductSummary,
  OdooVariantInfo,
  OrderItemRow,
  OrderRow,
  OrderStatus,
  PriceRuleRow,
} from "./types.ts";

export type AdminRoleName = "owner" | "admin" | "support" | string;

export interface AdminActor {
  id: string;
  role: AdminRoleName;
  requestId?: string;
}

export interface DealerSession {
  dealer: DealerRow;
  user: DealerUserRow;
  requestId?: string;
}

/** Explicit, separate capabilities (spec §2: pricing management is its own permission, never
 * implied by "can open the admin"). Only owner/admin hold the write capabilities in v1; the
 * `dealer_manager` role from the spec maps onto this table later without touching the engine. */
export type Capability = "dealers.view" | "dealers.manage" | "pricing.manage" | "orders.view" | "orders.manage";

const ROLE_CAPABILITIES: Record<string, Capability[]> = {
  owner: ["dealers.view", "dealers.manage", "pricing.manage", "orders.view", "orders.manage"],
  admin: ["dealers.view", "dealers.manage", "pricing.manage", "orders.view", "orders.manage"],
  support: ["dealers.view", "orders.view"],
};

const ALLOWED_TRANSITIONS: Record<DealerStatus, DealerStatus[]> = {
  draft: ["invited", "archived"],
  invited: ["active", "suspended", "archived"],
  active: ["suspended", "archived"],
  suspended: ["active", "invited", "archived"],
  archived: [],
};

const ODOO_STATE_TO_STATUS: Record<string, OrderStatus> = {
  draft: "quotation",
  sent: "quotation",
  sale: "confirmed",
  done: "completed",
  cancel: "cancelled",
};

const EXPIRING_SOON_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CART_QTY = 100_000;
const MAX_CART_LINES = 200;

export interface DealerEngine {
  callAdmin(actor: AdminActor, action: string, payload: unknown): Promise<unknown>;
  callDealer(session: DealerSession, action: string, payload: unknown): Promise<unknown>;
  resolveSession(authUserId: string, requestId?: string): Promise<DealerSession>;
  recordDenied(args: { actorId: string | null; reason: string; requestId?: string }): Promise<void>;
}

type AdminHandler = (actor: AdminActor, p: Payload) => Promise<unknown>;
type DealerHandler = (s: DealerSession, p: Payload) => Promise<unknown>;

export function createDealerEngine(deps: EngineDeps): DealerEngine {
  const { repo, odoo, auth } = deps;
  const now = (): Date => (deps.now ? deps.now() : new Date());
  const random = deps.random ?? Math.random;

  // ------------------------------------------------------------------------------------------
  // shared helpers
  // ------------------------------------------------------------------------------------------

  async function audit(args: {
    dealerId: string | null;
    actorType: "admin" | "dealer" | "system";
    actorId: string | null;
    event: string;
    entity?: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    requestId?: string;
  }): Promise<void> {
    await repo.appendAudit({
      dealer_id: args.dealerId,
      actor_type: args.actorType,
      actor_id: args.actorId,
      event_type: args.event,
      entity: args.entity ?? null,
      entity_id: args.entityId ?? null,
      old_value: args.oldValue ?? null,
      new_value: args.newValue ?? null,
      request_id: args.requestId ?? null,
    });
  }

  async function mustDealer(id: string): Promise<DealerRow> {
    const dealer = await repo.getDealer(id);
    if (!dealer) throw new DealerError("NOT_FOUND", "Dealer not found");
    return dealer;
  }

  function assertTransition(from: DealerStatus, to: DealerStatus): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) throw new DealerError("CONFLICT", `A ${from} dealer cannot become ${to}`);
  }

  function genDealerCode(displayName: string): string {
    const letters = displayName.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3).padEnd(3, "X");
    const digits = String(Math.floor(random() * 9000) + 1000);
    return `${letters}-${digits}`;
  }

  function priceView(rule: PriceRuleRow | null) {
    return rule
      ? { id: rule.id, pricePaise: rule.unit_price_paise, taxBasis: rule.tax_basis, startsAt: rule.starts_at, endsAt: rule.ends_at, note: rule.deal_note, version: rule.version }
      : null;
  }

  function snapshotAccess(a: Pick<AccessRow, "odoo_variant_id" | "is_visible" | "is_orderable" | "minimum_quantity" | "quantity_multiple">) {
    return { variantId: a.odoo_variant_id, visible: a.is_visible, orderable: a.is_orderable, min: a.minimum_quantity, multiple: a.quantity_multiple };
  }

  async function variantInfoOrThrow(ids: number[]): Promise<Map<number, OdooVariantInfo>> {
    try {
      return await odoo.getVariantInfo(ids);
    } catch {
      throw new DealerError("ODOO_UNAVAILABLE", "The product catalogue is temporarily unavailable — please try again shortly");
    }
  }

  async function wrapOdoo<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof DealerError) throw err;
      throw new DealerError("ODOO_UNAVAILABLE", "The product catalogue is temporarily unavailable — please try again shortly");
    }
  }

  /** Overlay DRAFT rules over the active ones (admin "preview as dealer" shows what publishing
   * would produce; the real dealer API never sees drafts). */
  function effectiveRules(rules: PriceRuleRow[], includeDrafts: boolean): PriceRuleRow[] {
    if (!includeDrafts) return rules.filter((r) => r.status === "active");
    const drafts = rules.filter((r) => r.status === "draft");
    const draftVariants = new Set(drafts.map((d) => d.odoo_variant_id));
    const past = new Date(0).toISOString();
    return [
      ...rules.filter((r) => r.status === "active" && !draftVariants.has(r.odoo_variant_id)),
      ...drafts.map((d) => ({ ...d, status: "active" as const, starts_at: d.starts_at ?? past })),
    ];
  }

  // ------------------------------------------------------------------------------------------
  // the dealer-facing catalogue — assignment-scoped BEFORE any product data is fetched
  // ------------------------------------------------------------------------------------------

  interface CatalogOptions {
    q?: string | null;
    page: number;
    pageSize: number;
    includeDrafts?: boolean;
    templateId?: number;
    featuredOnly?: boolean;
  }

  async function buildCatalog(dealer: DealerRow, opts: CatalogOptions) {
    const [allAccess, allRules, branding] = await Promise.all([repo.listAccess(dealer.id), repo.listRules(dealer.id), repo.getBranding(dealer.id)]);
    const showPublic = branding?.show_public_price ?? false;
    let access = allAccess.filter((a) => a.is_visible);
    if (opts.templateId !== undefined) access = access.filter((a) => a.odoo_template_id === opts.templateId);
    if (opts.featuredOnly) {
      const featured = access.filter((a) => a.featured_rank !== null).sort((a, b) => (a.featured_rank ?? 0) - (b.featured_rank ?? 0));
      if (featured.length > 0) access = featured;
    }
    const rules = effectiveRules(allRules, opts.includeDrafts ?? false);

    const orderedTemplates: number[] = [];
    for (const a of [...access].sort((x, y) => x.product_name.localeCompare(y.product_name))) {
      if (!orderedTemplates.includes(a.odoo_template_id)) orderedTemplates.push(a.odoo_template_id);
    }
    if (orderedTemplates.length === 0) return { items: [], page: opts.page, pageSize: opts.pageSize, total: 0, totalPages: 1 };

    const offset = (opts.page - 1) * opts.pageSize;
    let products: OdooProductSummary[];
    let total: number;
    if (opts.q) {
      // Scoped by the assigned template ids IN the Odoo query — a search can never surface an
      // unassigned product, its count, or its suggestion (FR-11).
      const res = await wrapOdoo(() => odoo.searchProducts({ text: opts.q ?? undefined, templateIds: orderedTemplates, offset, limit: opts.pageSize }));
      products = res.items;
      total = res.total;
    } else {
      const slice = orderedTemplates.slice(offset, offset + opts.pageSize);
      const res = slice.length ? await wrapOdoo(() => odoo.searchProducts({ templateIds: slice, offset: 0, limit: slice.length })) : { items: [] as OdooProductSummary[] };
      const byId = new Map(res.items.map((p) => [p.templateId, p]));
      products = slice.map((id) => byId.get(id)).filter((p): p is OdooProductSummary => !!p);
      total = orderedTemplates.length;
    }

    const accessByVariant = new Map(access.map((a) => [a.odoo_variant_id, a]));
    const t = now();
    const items = products
      .map((product) => {
        const variants = product.variants
          .filter((v) => accessByVariant.has(v.variantId))
          .map((v) => {
            const a = accessByVariant.get(v.variantId)!;
            const rule = resolveActiveRule(rules, v.variantId, t);
            const reason = !v.purchasable ? "unavailable" : !a.is_orderable ? "not_orderable" : !rule ? "no_price" : null;
            return {
              variantId: v.variantId,
              sku: v.sku ?? a.sku,
              name: v.name,
              attributes: v.attributes,
              pricePaise: rule ? rule.unit_price_paise : null,
              taxBasis: rule ? rule.tax_basis : null,
              orderable: reason === null,
              unavailableReason: reason,
              minQty: a.minimum_quantity,
              qtyMultiple: a.quantity_multiple,
              publicPricePaise: showPublic ? v.publicPricePaise : null,
            };
          });
        const prices = variants.map((v) => v.pricePaise).filter((p): p is number => p !== null);
        return {
          templateId: product.templateId,
          name: product.name,
          sku: product.sku,
          imageUrl: product.imageUrl,
          categories: product.categories,
          description: product.description ?? null,
          fromPricePaise: prices.length ? Math.min(...prices) : null,
          variants,
        };
      })
      .filter((p) => p.variants.length > 0);

    return { items, page: opts.page, pageSize: opts.pageSize, total, totalPages: Math.max(1, Math.ceil(total / opts.pageSize)) };
  }

  // ------------------------------------------------------------------------------------------
  // cart / quote
  // ------------------------------------------------------------------------------------------

  async function quoteForCart(dealer: DealerRow) {
    const [cart, access, rules] = await Promise.all([repo.listCart(dealer.id), repo.listAccess(dealer.id), repo.listRules(dealer.id, { statuses: ["active"] })]);
    const variants = cart.length ? await variantInfoOrThrow(cart.map((c) => c.odoo_variant_id)) : new Map<number, OdooVariantInfo>();
    const quote = await buildDealerQuote({
      lines: cart.map((c) => ({ variantId: c.odoo_variant_id, quantity: c.quantity, quotedPricePaise: c.quoted_price_paise })),
      access,
      rules,
      variants,
      now: now(),
    });
    return { quote, cart, access, variants };
  }

  async function decorateQuote(quote: DealerQuote, variants: Map<number, OdooVariantInfo>) {
    const templateIds = [...new Set(quote.lines.map((l) => l.templateId).filter((x): x is number => x !== null))];
    const images = new Map<number, string | null>();
    if (templateIds.length) {
      try {
        const res = await odoo.searchProducts({ templateIds, offset: 0, limit: templateIds.length });
        for (const p of res.items) images.set(p.templateId, p.imageUrl);
      } catch {
        /* images are decoration only — never fail a quote over them */
      }
    }
    return {
      ...quote,
      lines: quote.lines.map((l: DealerQuoteLine) => ({
        ...l,
        imageUrl: l.templateId !== null ? (images.get(l.templateId) ?? null) : null,
        attributes: variants.get(l.variantId)?.attributes ?? [],
      })),
    };
  }

  // ------------------------------------------------------------------------------------------
  // Odoo sync of a stored order (used on placement and by admin retry)
  // ------------------------------------------------------------------------------------------

  async function syncOrderToOdoo(dealer: DealerRow, order: OrderRow, items: OrderItemRow[], actor: { type: "dealer" | "admin" | "system"; id: string | null }): Promise<OrderRow> {
    try {
      const infos = await odoo.getVariantInfo(items.map((i) => i.odoo_variant_id));
      const lines = items.map((item) => {
        const info = infos.get(item.odoo_variant_id);
        if (!info) throw new Error(`Variant ${item.odoo_variant_id} is not mapped in Odoo`);
        const money = computeLineMoney(item.unit_price_paise, item.quantity, item.tax_basis, info.taxes);
        if (!money.ok) throw new Error(`Unsupported tax configuration for variant ${item.odoo_variant_id}`);
        return { variantId: item.odoo_variant_id, quantity: item.quantity, unitPrice: money.odooUnitPrice };
      });
      let partnerId = dealer.linked_odoo_partner_id;
      if (!partnerId) {
        partnerId = await odoo.ensurePartner(dealer);
        await repo.updateDealer(dealer.id, { linked_odoo_partner_id: partnerId });
        await audit({ dealerId: dealer.id, actorType: "system", actorId: null, event: "odoo.partner_linked", entity: "dealer", entityId: dealer.id, newValue: { partnerId } });
      }
      const a = order.shipping_address;
      const shipTo = [a.name, a.phone, a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(", ");
      const note = [`Dealer order ${order.order_number}`, order.po_reference ? `Dealer PO: ${order.po_reference}` : null, shipTo ? `Ship to: ${shipTo}` : null, order.notes].filter(Boolean).join("\n");
      const created = await odoo.createQuotation({ partnerId, clientOrderRef: order.order_number, lines, note });
      const updated = await repo.updateOrder(order.id, {
        status: "quotation",
        odoo_sale_order_id: created.saleOrderId,
        odoo_order_name: created.name,
        last_sync_error: null,
      });
      await audit({ dealerId: dealer.id, actorType: actor.type, actorId: actor.id, event: "order.synced", entity: "order", entityId: order.id, newValue: { odooOrder: created.name } });
      return updated;
    } catch (err) {
      const message = (err instanceof Error ? err.message : "Unknown error").slice(0, 300);
      const updated = await repo.updateOrder(order.id, { retry_count: order.retry_count + 1, last_sync_error: message });
      await audit({ dealerId: dealer.id, actorType: actor.type, actorId: actor.id, event: "order.sync_failed", entity: "order", entityId: order.id, newValue: { error: message } });
      return updated;
    }
  }

  async function refreshOrderStatus(dealerId: string, order: OrderRow): Promise<OrderRow> {
    if (!order.odoo_sale_order_id || order.status === "completed" || order.status === "cancelled" || order.status === "pending_sync") return order;
    try {
      const states = await odoo.getOrderStates([order.odoo_sale_order_id]);
      const mapped = ODOO_STATE_TO_STATUS[states.get(order.odoo_sale_order_id) ?? ""];
      if (mapped && mapped !== order.status) {
        const updated = await repo.updateOrder(order.id, { status: mapped });
        await audit({ dealerId, actorType: "system", actorId: null, event: "order.status_changed", entity: "order", entityId: order.id, oldValue: { status: order.status }, newValue: { status: mapped } });
        return updated;
      }
    } catch {
      /* status is best-effort — never fail a read because Odoo is slow */
    }
    return order;
  }

  function orderView(order: OrderRow) {
    return {
      id: order.id,
      orderNumber: order.order_number,
      status: order.status,
      odooOrderName: order.odoo_order_name,
      subtotalPaise: order.subtotal_paise,
      taxPaise: order.tax_paise,
      shippingPaise: order.shipping_paise,
      totalPaise: order.total_paise,
      shippingAddress: order.shipping_address,
      poReference: order.po_reference,
      notes: order.notes,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      syncPending: order.status === "pending_sync",
    };
  }

  function itemView(item: OrderItemRow) {
    return {
      variantId: item.odoo_variant_id,
      templateId: item.odoo_template_id,
      sku: item.sku,
      name: item.product_name,
      quantity: item.quantity,
      unitPricePaise: item.unit_price_paise,
      taxBasis: item.tax_basis,
      subtotalPaise: item.subtotal_paise,
      taxPaise: item.tax_paise,
      totalPaise: item.line_total_paise,
    };
  }

  // ------------------------------------------------------------------------------------------
  // ADMIN actions
  // ------------------------------------------------------------------------------------------

  const adminCaps: Record<string, Capability> = {
    "dealers.list": "dealers.view",
    "dealers.get": "dealers.view",
    "dealers.create": "dealers.manage",
    "dealers.update": "dealers.manage",
    "dealers.branding": "dealers.manage",
    "dealers.setStatus": "dealers.manage",
    "dealers.bulkSuspend": "dealers.manage",
    "dealers.invite": "dealers.manage",
    "catalog.searchMaster": "pricing.manage",
    "catalog.get": "dealers.view",
    "catalog.assign": "pricing.manage",
    "catalog.unassign": "pricing.manage",
    "catalog.updateAccess": "pricing.manage",
    "prices.saveDraft": "pricing.manage",
    "prices.discardDraft": "pricing.manage",
    "prices.publish": "pricing.manage",
    "prices.history": "dealers.view",
    "prices.revert": "pricing.manage",
    "prices.bulkAdjust": "pricing.manage",
    "prices.copyFrom": "pricing.manage",
    "prices.importPreview": "pricing.manage",
    "prices.importCommit": "pricing.manage",
    "preview.catalog": "dealers.view",
    "orders.list": "orders.view",
    "orders.get": "orders.view",
    "orders.retrySync": "orders.manage",
    "audit.list": "dealers.view",
  };

  const admin: Record<string, AdminHandler> = {
    "dealers.list": async (_a, p) => {
      const { page, pageSize, offset } = pageParams(p, 25, 100);
      const status = optStr(p, "status", 20) as DealerStatus | null;
      const { rows, total } = await repo.listDealers({ search: optStr(p, "search", 100) ?? undefined, status: status ?? undefined, offset, limit: pageSize });
      const stats = await repo.dealerStats(rows.map((r) => r.id));
      const branding = await Promise.all(rows.map((r) => repo.getBranding(r.id)));
      return {
        page,
        pageSize,
        total,
        rows: rows.map((r, i) => ({
          id: r.id,
          dealerCode: r.dealer_code,
          displayName: r.display_name,
          legalName: r.legal_name,
          status: r.status,
          logoPath: branding[i]?.logo_path ?? null,
          accentColor: branding[i]?.accent_color ?? null,
          ownerEmail: stats.get(r.id)?.ownerEmail ?? r.contact_email,
          assignedCount: stats.get(r.id)?.assignedCount ?? 0,
          lastOrderAt: stats.get(r.id)?.lastOrderAt ?? null,
          lastLoginAt: stats.get(r.id)?.lastLoginAt ?? null,
          updatedAt: r.updated_at,
        })),
      };
    },

    "dealers.get": async (_a, p) => {
      const dealer = await mustDealer(reqUuid(p, "id"));
      const [branding, users, access, rules, orderCounts] = await Promise.all([
        repo.getBranding(dealer.id),
        repo.listDealerUsers(dealer.id),
        repo.listAccess(dealer.id),
        repo.listRules(dealer.id),
        repo.countOrdersByStatus(dealer.id),
      ]);
      const readiness = checkReadiness({ ownerEmail: dealer.contact_email, access, rules: rules.filter((r) => r.status === "active"), now: now() });
      return {
        dealer,
        branding,
        users: users.map((u) => ({ id: u.id, email: u.email, status: u.status, invitedAt: u.invited_at, lastLoginAt: u.last_login_at })),
        stats: { assigned: access.length, draftPrices: rules.filter((r) => r.status === "draft").length, activePrices: rules.filter((r) => r.status === "active").length, orders: orderCounts },
        readiness,
        ready: readiness.length === 0,
      };
    },

    "dealers.create": async (a, p) => {
      const displayName = reqStr(p, "displayName", 120, "Display name");
      const email = reqEmail(p, "contactEmail", "Owner email");
      const dealer = await repo.insertDealer({
        dealer_code: genDealerCode(displayName),
        legal_name: reqStr(p, "legalName", 200, "Legal business name"),
        display_name: displayName,
        contact_name: optStr(p, "contactName", 120),
        contact_email: email,
        contact_phone: optPhone(p, "contactPhone"),
        gstin: optGstin(p, "gstin"),
        billing_address: parseAddress(p.billingAddress, false, "Billing address"),
        shipping_address: parseAddress(p.shippingAddress, false, "Shipping address"),
        currency: "INR",
        status: "draft",
        linked_odoo_partner_id: null,
        created_by: a.id,
      });
      await repo.upsertBranding(dealer.id, { accent_color: reqAccent(p, "accentColor") ?? "#10148F" });
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: "dealer.created", entity: "dealer", entityId: dealer.id, newValue: { code: dealer.dealer_code, displayName }, requestId: a.requestId });
      return { dealer };
    },

    "dealers.update": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "id"));
      const expected = optStr(p, "expectedUpdatedAt", 40);
      if (expected && expected !== dealer.updated_at) throw new DealerError("CONFLICT", "This dealer was changed by someone else — reload and try again");
      const patch: Partial<DealerRow> = {};
      if ("legalName" in p) patch.legal_name = reqStr(p, "legalName", 200, "Legal business name");
      if ("displayName" in p) patch.display_name = reqStr(p, "displayName", 120, "Display name");
      if ("contactName" in p) patch.contact_name = optStr(p, "contactName", 120);
      if ("contactEmail" in p) patch.contact_email = reqEmail(p, "contactEmail", "Owner email");
      if ("contactPhone" in p) patch.contact_phone = optPhone(p, "contactPhone");
      if ("gstin" in p) patch.gstin = optGstin(p, "gstin");
      if ("billingAddress" in p) patch.billing_address = parseAddress(p.billingAddress, false, "Billing address");
      if ("shippingAddress" in p) patch.shipping_address = parseAddress(p.shippingAddress, false, "Shipping address");
      const updated = await repo.updateDealer(dealer.id, patch);
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: "dealer.updated", entity: "dealer", entityId: dealer.id, oldValue: pick(dealer, Object.keys(patch)), newValue: pick(updated, Object.keys(patch)), requestId: a.requestId });
      return { dealer: updated };
    },

    "dealers.branding": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "id"));
      const before = await repo.getBranding(dealer.id);
      const patch: Record<string, unknown> = {};
      const logo = optMediaPath(p, "logoPath");
      if (logo !== undefined) patch.logo_path = logo;
      const cover = optMediaPath(p, "coverPath");
      if (cover !== undefined) patch.cover_path = cover;
      const accent = reqAccent(p, "accentColor");
      if (accent) patch.accent_color = accent;
      if ("tagline" in p) patch.tagline = optStr(p, "tagline", 140, "Tagline");
      if ("welcomeText" in p) patch.welcome_text = optStr(p, "welcomeText", 400, "Welcome message");
      const showPublic = optBool(p, "showPublicPrice");
      if (showPublic !== undefined) patch.show_public_price = showPublic;
      const branding = await repo.upsertBranding(dealer.id, patch);
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: "branding.updated", entity: "branding", entityId: dealer.id, oldValue: before ? pick(before, Object.keys(patch)) : null, newValue: patch, requestId: a.requestId });
      return { branding };
    },

    "dealers.setStatus": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "id"));
      const to = reqStr(p, "status", 20) as DealerStatus;
      if (!(to in ALLOWED_TRANSITIONS)) throw new DealerError("VALIDATION", "Unknown status");
      if (to === "invited") throw new DealerError("VALIDATION", "Use “Activate & send invite” to invite a dealer");
      let target: DealerStatus = to;
      if (dealer.status === "suspended" && to === "active") {
        // Re-activating never skips onboarding: a dealer who never signed in goes back to "invited".
        const users = await repo.listDealerUsers(dealer.id);
        target = users.some((u) => u.status === "active") ? "active" : "invited";
      } else assertTransition(dealer.status, to);
      const updated = await repo.updateDealer(dealer.id, { status: target });
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: `dealer.${target === "suspended" ? "suspended" : target === "archived" ? "archived" : "reactivated"}`, entity: "dealer", entityId: dealer.id, oldValue: { status: dealer.status }, newValue: { status: target }, requestId: a.requestId });
      return { dealer: updated };
    },

    "dealers.bulkSuspend": async (a, p) => {
      if (optBool(p, "confirm") !== true) throw new DealerError("VALIDATION", "Bulk suspend must be explicitly confirmed");
      const ids = Array.isArray(p.ids) ? p.ids.map(String).slice(0, 100) : [];
      if (ids.length === 0) throw new DealerError("VALIDATION", "Select at least one dealer");
      let suspended = 0;
      const skipped: string[] = [];
      for (const id of ids) {
        const dealer = await repo.getDealer(id);
        if (!dealer || !ALLOWED_TRANSITIONS[dealer.status].includes("suspended")) {
          skipped.push(id);
          continue;
        }
        await repo.updateDealer(id, { status: "suspended" });
        await audit({ dealerId: id, actorType: "admin", actorId: a.id, event: "dealer.suspended", entity: "dealer", entityId: id, oldValue: { status: dealer.status }, newValue: { status: "suspended", bulk: true }, requestId: a.requestId });
        suspended++;
      }
      return { suspended, skipped };
    },

    "dealers.invite": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "id"));
      if (dealer.status !== "draft" && dealer.status !== "invited" && dealer.status !== "suspended") {
        throw new DealerError("CONFLICT", dealer.status === "active" ? "This dealer is already active — use password reset instead" : `A ${dealer.status} dealer cannot be invited`);
      }
      if (dealer.status === "suspended") throw new DealerError("CONFLICT", "Reactivate the dealer before sending an invite");
      const [access, rules] = await Promise.all([repo.listAccess(dealer.id), repo.listRules(dealer.id, { statuses: ["active"] })]);
      const issues = checkReadiness({ ownerEmail: dealer.contact_email, access, rules, now: now() });
      if (issues.length > 0) throw new DealerError("NOT_READY", "This dealer isn't ready to activate yet", { issues });

      const invited = await auth.inviteDealerUser(dealer.contact_email, { dealerCode: dealer.dealer_code, displayName: dealer.display_name });
      const existingMapping = await repo.getDealerUserByAuthId(invited.authUserId);
      if (existingMapping && existingMapping.dealer_id !== dealer.id) {
        throw new DealerError("CONFLICT", "That email already belongs to another dealer account");
      }
      if (!existingMapping) {
        await repo.insertDealerUser({ dealer_id: dealer.id, auth_user_id: invited.authUserId, email: dealer.contact_email, role: "owner", status: "invited", invited_at: now().toISOString(), last_login_at: null });
      }
      const updated = dealer.status === "draft" ? await repo.updateDealer(dealer.id, { status: "invited" }) : dealer;
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: "invite.sent", entity: "dealer_user", entityId: invited.authUserId, newValue: { email: dealer.contact_email, existingAccount: invited.existing }, requestId: a.requestId });
      return { dealer: updated, existingAccount: invited.existing };
    },

    "catalog.searchMaster": async (_a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const { page, pageSize, offset } = pageParams(p, 20, 50);
      const access = await repo.listAccess(dealer.id);
      const assigned = new Set(access.map((x) => x.odoo_variant_id));
      const res = await wrapOdoo(() => odoo.searchProducts({ text: optStr(p, "q", 100) ?? undefined, offset, limit: pageSize }));
      return {
        page,
        pageSize,
        total: res.total,
        totalPages: Math.max(1, Math.ceil(res.total / pageSize)),
        items: res.items.map((prod) => ({
          templateId: prod.templateId,
          name: prod.name,
          sku: prod.sku,
          imageUrl: prod.imageUrl,
          variants: prod.variants.map((v) => ({ variantId: v.variantId, sku: v.sku, name: v.name, attributes: v.attributes, publicPricePaise: v.publicPricePaise, purchasable: v.purchasable, assigned: assigned.has(v.variantId) })),
        })),
      };
    },

    "catalog.get": async (_a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const { page, pageSize, offset } = pageParams(p, 50, 200);
      const filter = optStr(p, "filter", 20) ?? "all";
      const q = (optStr(p, "q", 100) ?? "").toLowerCase();
      const [access, rules] = await Promise.all([repo.listAccess(dealer.id), repo.listRules(dealer.id)]);
      const t = now();
      const rows = access
        .filter((a) => !q || a.product_name.toLowerCase().includes(q) || (a.sku ?? "").toLowerCase().includes(q))
        .map((a) => {
          const active = resolveActiveRule(rules, a.odoo_variant_id, t);
          const draft = rules.find((r) => r.status === "draft" && r.odoo_variant_id === a.odoo_variant_id) ?? null;
          const expiring = !!active && !!active.ends_at && Date.parse(active.ends_at) - t.getTime() < EXPIRING_SOON_MS;
          const state = !active ? (draft ? "draft_only" : "missing_price") : expiring ? "expiring" : draft ? "draft_pending" : "ok";
          return {
            variantId: a.odoo_variant_id,
            templateId: a.odoo_template_id,
            sku: a.sku,
            name: a.product_name,
            isVisible: a.is_visible,
            isOrderable: a.is_orderable,
            minQty: a.minimum_quantity,
            qtyMultiple: a.quantity_multiple,
            featuredRank: a.featured_rank,
            activePrice: priceView(active),
            draftPrice: priceView(draft),
            state,
          };
        })
        .filter((r) => filter === "all" || filter === "assigned" || (filter === "missing_price" && (r.state === "missing_price" || r.state === "draft_only")) || (filter === "expiring" && r.state === "expiring") || (filter === "drafts" && !!r.draftPrice))
        .sort((x, y) => x.name.localeCompare(y.name));
      const slice = rows.slice(offset, offset + pageSize);
      // Public reference price is live Odoo data — fetched for the visible page only, best-effort.
      let infos = new Map<number, OdooVariantInfo>();
      try {
        infos = slice.length ? await odoo.getVariantInfo(slice.map((r) => r.variantId)) : infos;
      } catch {
        /* admin grid stays usable when Odoo is slow */
      }
      return {
        page,
        pageSize,
        total: rows.length,
        totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
        rows: slice.map((r) => ({ ...r, publicPricePaise: infos.get(r.variantId)?.publicPricePaise ?? null, availableInOdoo: infos.has(r.variantId) ? infos.get(r.variantId)!.purchasable : null })),
      };
    },

    "catalog.assign": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const variantIds = intArray(p, "variantIds", 200, "Products");
      const infos = await variantInfoOrThrow(variantIds);
      const missing = variantIds.filter((id) => !infos.has(id));
      if (missing.length) throw new DealerError("VALIDATION", `${missing.length} selected product${missing.length === 1 ? " is" : "s are"} not in the Odoo catalogue`, { variantIds: missing });
      const existing = new Set((await repo.listAccess(dealer.id)).map((x) => x.odoo_variant_id));
      const fresh = variantIds.filter((id) => !existing.has(id));
      if (fresh.length === 0) return { assigned: 0 };
      await repo.upsertAccess(
        fresh.map((id) => {
          const info = infos.get(id)!;
          return { dealer_id: dealer.id, odoo_template_id: info.templateId, odoo_variant_id: id, sku: info.sku, product_name: info.name, is_visible: true, is_orderable: true, minimum_quantity: 1, quantity_multiple: 1, featured_rank: null, updated_by: a.id };
        })
      );
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: "access.assigned", entity: "product_access", newValue: { variantIds: fresh }, requestId: a.requestId });
      return { assigned: fresh.length };
    },

    "catalog.unassign": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const variantIds = intArray(p, "variantIds", 500, "Products");
      const before = (await repo.listAccess(dealer.id)).filter((x) => variantIds.includes(x.odoo_variant_id));
      await repo.deleteAccess(dealer.id, variantIds);
      await repo.deleteDraftRules(dealer.id, (await repo.listRules(dealer.id, { statuses: ["draft"], variantIds })).map((r) => r.id));
      // Cart lines for a variant that is no longer assigned are dropped immediately (fail closed).
      for (const id of variantIds) await repo.deleteCartItem(dealer.id, id);
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: "access.unassigned", entity: "product_access", oldValue: before.map(snapshotAccess), requestId: a.requestId });
      return { removed: before.length };
    },

    "catalog.updateAccess": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const variantId = reqInt(p, "variantId");
      const row = (await repo.listAccess(dealer.id)).find((x) => x.odoo_variant_id === variantId);
      if (!row) throw new DealerError("NOT_FOUND", "That product isn't assigned to this dealer");
      const next = {
        ...row,
        is_visible: optBool(p, "isVisible") ?? row.is_visible,
        is_orderable: optBool(p, "isOrderable") ?? row.is_orderable,
        minimum_quantity: optInt(p, "minQty", 1, 100_000) ?? row.minimum_quantity,
        quantity_multiple: optInt(p, "qtyMultiple", 1, 100_000) ?? row.quantity_multiple,
        featured_rank: "featuredRank" in p ? optInt(p, "featuredRank", 1, 1000) : row.featured_rank,
        updated_by: a.id,
      };
      const { id: _id, updated_at: _u, ...rest } = next;
      await repo.upsertAccess([rest]);
      if (!next.is_visible) await repo.deleteCartItem(dealer.id, variantId);
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: "access.updated", entity: "product_access", entityId: String(variantId), oldValue: snapshotAccess(row), newValue: snapshotAccess(next), requestId: a.requestId });
      return { ok: true };
    },

    "prices.saveDraft": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const variantId = reqInt(p, "variantId");
      const input = { pricePaise: reqInt(p, "pricePaise", 1, 1_000_000_000_000, "Price"), taxBasis: reqStr(p, "taxBasis", 12) as "exclusive" | "inclusive", startsAt: optStr(p, "startsAt", 40), endsAt: optStr(p, "endsAt", 40), note: optStr(p, "note", 500) };
      validatePriceInput(input);
      return saveDraft(dealer.id, variantId, input, a);
    },

    "prices.discardDraft": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const variantIds = intArray(p, "variantIds", 500, "Products");
      const drafts = await repo.listRules(dealer.id, { statuses: ["draft"], variantIds });
      await repo.deleteDraftRules(dealer.id, drafts.map((d) => d.id));
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: "price.draft_discarded", entity: "price_rule", oldValue: drafts.map((d) => ({ variantId: d.odoo_variant_id, pricePaise: d.unit_price_paise })), requestId: a.requestId });
      return { discarded: drafts.length };
    },

    "prices.publish": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const only = Array.isArray(p.variantIds) ? intArray(p, "variantIds", 500, "Products") : undefined;
      return publish(dealer.id, only, a, "price.published");
    },

    "prices.history": async (_a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const variantId = optInt(p, "variantId");
      const rules = await repo.listRules(dealer.id, variantId ? { variantIds: [variantId] } : undefined);
      return { rules: rules.sort((x, y) => y.created_at.localeCompare(x.created_at)).slice(0, 200).map((r) => ({ id: r.id, variantId: r.odoo_variant_id, status: r.status, pricePaise: r.unit_price_paise, taxBasis: r.tax_basis, startsAt: r.starts_at, endsAt: r.ends_at, note: r.deal_note, version: r.version, createdAt: r.created_at })) };
    },

    "prices.revert": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const ruleId = reqUuid(p, "ruleId");
      const old = (await repo.listRules(dealer.id)).find((r) => r.id === ruleId);
      if (!old) throw new DealerError("NOT_FOUND", "That price record doesn't exist");
      if (old.status === "draft") throw new DealerError("VALIDATION", "Only published prices can be restored");
      const access = (await repo.listAccess(dealer.id)).find((x) => x.odoo_variant_id === old.odoo_variant_id);
      if (!access) throw new DealerError("VALIDATION", "That product is no longer assigned to this dealer");
      // A revert is a NEW price effective now (history stays immutable), audited as its own event.
      await saveDraft(dealer.id, old.odoo_variant_id, { pricePaise: old.unit_price_paise, taxBasis: old.tax_basis, startsAt: null, endsAt: null, note: `Restored from ${old.created_at.slice(0, 10)}` }, a);
      return publish(dealer.id, [old.odoo_variant_id], a, "price.reverted");
    },

    "prices.bulkAdjust": async (a, p) => {
      if (optBool(p, "confirm") !== true) throw new DealerError("VALIDATION", "A bulk price change must be explicitly confirmed");
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const variantIds = intArray(p, "variantIds", 500, "Products");
      const percent = Number(p.percent);
      const rules = await repo.listRules(dealer.id, { statuses: ["active"], variantIds });
      const t = now();
      let drafted = 0;
      const skipped: number[] = [];
      for (const id of variantIds) {
        const active = resolveActiveRule(rules, id, t);
        if (!active) {
          skipped.push(id);
          continue;
        }
        await saveDraft(dealer.id, id, { pricePaise: adjustPaiseByPercent(active.unit_price_paise, percent), taxBasis: active.tax_basis, startsAt: null, endsAt: null, note: `Bulk ${percent > 0 ? "+" : ""}${percent}%` }, a, true);
        drafted++;
      }
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: "price.bulk_adjusted", entity: "price_rule", newValue: { percent, drafted, skipped: skipped.length }, requestId: a.requestId });
      return { drafted, skipped };
    },

    "prices.copyFrom": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const source = await mustDealer(reqUuid(p, "fromDealerId", "Source dealer"));
      if (source.id === dealer.id) throw new DealerError("VALIDATION", "Choose a different dealer to copy from");
      const withPrices = optBool(p, "withPrices") ?? true;
      const [srcAccess, srcRules, mine] = await Promise.all([repo.listAccess(source.id), repo.listRules(source.id, { statuses: ["active"] }), repo.listAccess(dealer.id)]);
      const have = new Set(mine.map((x) => x.odoo_variant_id));
      const fresh = srcAccess.filter((x) => !have.has(x.odoo_variant_id));
      if (fresh.length) {
        await repo.upsertAccess(fresh.map((x) => ({ dealer_id: dealer.id, odoo_template_id: x.odoo_template_id, odoo_variant_id: x.odoo_variant_id, sku: x.sku, product_name: x.product_name, is_visible: x.is_visible, is_orderable: x.is_orderable, minimum_quantity: x.minimum_quantity, quantity_multiple: x.quantity_multiple, featured_rank: x.featured_rank, updated_by: a.id })));
      }
      let drafted = 0;
      if (withPrices) {
        const t = now();
        for (const x of fresh) {
          const rule = resolveActiveRule(srcRules, x.odoo_variant_id, t);
          if (!rule) continue;
          await saveDraft(dealer.id, x.odoo_variant_id, { pricePaise: rule.unit_price_paise, taxBasis: rule.tax_basis, startsAt: null, endsAt: null, note: `Copied from ${source.dealer_code}` }, a, true);
          drafted++;
        }
      }
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: "catalog.copied", entity: "dealer", entityId: source.id, newValue: { assigned: fresh.length, drafted, withPrices }, requestId: a.requestId });
      return { assigned: fresh.length, drafted };
    },

    "prices.importPreview": async (_a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      return resolveImport(dealer.id, reqStr(p, "csv", 1_000_000, "CSV"));
    },

    "prices.importCommit": async (a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const skipInvalid = optBool(p, "skipInvalid") === true;
      const preview = await resolveImport(dealer.id, reqStr(p, "csv", 1_000_000, "CSV"));
      if (preview.fatal) throw new DealerError("VALIDATION", preview.fatal);
      const bad = preview.rows.filter((r) => r.status === "error");
      if (bad.length > 0 && !skipInvalid) throw new DealerError("VALIDATION", `${bad.length} row${bad.length === 1 ? " has" : "s have"} errors — fix the file or choose to skip invalid rows`, { errorRows: bad.map((r) => r.line) });
      const good = preview.rows.filter((r) => r.status === "ok" && r.variantId !== null);
      const existing = new Set((await repo.listAccess(dealer.id)).map((x) => x.odoo_variant_id));
      const infos = await variantInfoOrThrow(good.map((r) => r.variantId!));
      const toAssign = good.filter((r) => !existing.has(r.variantId!));
      if (toAssign.length) {
        await repo.upsertAccess(
          toAssign.map((r) => {
            const info = infos.get(r.variantId!)!;
            return { dealer_id: dealer.id, odoo_template_id: info.templateId, odoo_variant_id: r.variantId!, sku: info.sku, product_name: info.name, is_visible: true, is_orderable: true, minimum_quantity: r.minQty ?? 1, quantity_multiple: r.qtyMultiple ?? 1, featured_rank: null, updated_by: a.id };
          })
        );
      }
      for (const r of good.filter((x) => existing.has(x.variantId!) && (x.minQty || x.qtyMultiple))) {
        const row = (await repo.listAccess(dealer.id)).find((x) => x.odoo_variant_id === r.variantId)!;
        const { id: _i, updated_at: _u, ...rest } = row;
        await repo.upsertAccess([{ ...rest, minimum_quantity: r.minQty ?? row.minimum_quantity, quantity_multiple: r.qtyMultiple ?? row.quantity_multiple, updated_by: a.id }]);
      }
      let drafted = 0;
      for (const r of good) {
        if (r.action === "unchanged") continue;
        await saveDraft(dealer.id, r.variantId!, { pricePaise: r.newPricePaise!, taxBasis: r.taxBasis!, startsAt: r.startsAt, endsAt: r.endsAt, note: r.note ?? "CSV import" }, a, true);
        drafted++;
      }
      await audit({ dealerId: dealer.id, actorType: "admin", actorId: a.id, event: "price.imported", entity: "price_rule", newValue: { rows: good.length, drafted, assigned: toAssign.length, skipped: bad.length }, requestId: a.requestId });
      return { drafted, assigned: toAssign.length, skipped: bad.length };
    },

    "preview.catalog": async (_a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const { page, pageSize } = pageParams(p, 12, 48);
      const branding = await repo.getBranding(dealer.id);
      const catalog = await buildCatalog(dealer, { q: optStr(p, "q", 100), page, pageSize, includeDrafts: true });
      // Read-only by construction: this action has no cart/order counterpart, and the dealer-facing
      // API is the only way to place an order — and it needs a real dealer session.
      return { preview: true, dealer: { displayName: dealer.display_name, legalName: dealer.legal_name }, branding, catalog };
    },

    "orders.list": async (_a, p) => {
      const { page, pageSize, offset } = pageParams(p, 25, 100);
      const dealerId = p.dealerId ? reqUuid(p, "dealerId") : undefined;
      const status = optStr(p, "status", 20) as OrderStatus | null;
      const { rows, total } = await repo.listOrders({ dealerId, status: status ?? undefined, offset, limit: pageSize });
      const dealers = new Map<string, DealerRow | null>();
      for (const r of rows) if (!dealers.has(r.dealer_id)) dealers.set(r.dealer_id, await repo.getDealer(r.dealer_id));
      return { page, pageSize, total, rows: rows.map((r) => ({ ...orderView(r), dealerId: r.dealer_id, dealerName: dealers.get(r.dealer_id)?.display_name ?? "—", lastSyncError: r.last_sync_error, retryCount: r.retry_count })) };
    },

    "orders.get": async (_a, p) => {
      const order = await repo.getOrder(reqUuid(p, "id"));
      if (!order) throw new DealerError("NOT_FOUND", "Order not found");
      const refreshed = await refreshOrderStatus(order.dealer_id, order);
      const [items, dealer] = await Promise.all([repo.listOrderItems(order.id), repo.getDealer(order.dealer_id)]);
      return { order: { ...orderView(refreshed), dealerId: order.dealer_id, dealerName: dealer?.display_name ?? "—", lastSyncError: refreshed.last_sync_error, retryCount: refreshed.retry_count }, items: items.map(itemView) };
    },

    "orders.retrySync": async (a, p) => {
      const order = await repo.getOrder(reqUuid(p, "id"));
      if (!order) throw new DealerError("NOT_FOUND", "Order not found");
      if (order.status !== "pending_sync") throw new DealerError("CONFLICT", "Only an order waiting for Odoo can be retried");
      const [dealer, items] = await Promise.all([mustDealer(order.dealer_id), repo.listOrderItems(order.id)]);
      const updated = await syncOrderToOdoo(dealer, order, items, { type: "admin", id: a.id });
      return { order: orderView(updated), synced: updated.status !== "pending_sync" };
    },

    "audit.list": async (_a, p) => {
      const dealer = await mustDealer(reqUuid(p, "dealerId"));
      const { page, pageSize, offset } = pageParams(p, 50, 200);
      const { rows, total } = await repo.listAudit({ dealerId: dealer.id, offset, limit: pageSize });
      return { page, pageSize, total, rows: rows.map((r) => ({ id: r.id, at: r.created_at, actorType: r.actor_type, actorId: r.actor_id, event: r.event_type, entity: r.entity, entityId: r.entity_id, oldValue: r.old_value, newValue: r.new_value })) };
    },
  };

  async function saveDraft(dealerId: string, variantId: number, input: { pricePaise: number; taxBasis: "exclusive" | "inclusive"; startsAt?: string | null; endsAt?: string | null; note?: string | null }, a: AdminActor, quiet = false) {
    validatePriceInput(input);
    const access = (await repo.listAccess(dealerId)).find((x) => x.odoo_variant_id === variantId);
    if (!access) throw new DealerError("VALIDATION", "Assign this product to the dealer before setting a price");
    const existingDrafts = await repo.listRules(dealerId, { statuses: ["draft"], variantIds: [variantId] });
    await repo.deleteDraftRules(dealerId, existingDrafts.map((d) => d.id));
    const rule = await repo.insertRule({
      dealer_id: dealerId,
      odoo_variant_id: variantId,
      unit_price_paise: input.pricePaise,
      currency: "INR",
      tax_basis: input.taxBasis,
      starts_at: input.startsAt ? new Date(input.startsAt).toISOString() : null,
      ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
      status: "draft",
      deal_note: input.note ?? null,
      created_by: a.id,
    });
    if (!quiet) {
      await audit({ dealerId, actorType: "admin", actorId: a.id, event: "price.draft_saved", entity: "price_rule", entityId: rule.id, newValue: { variantId, pricePaise: input.pricePaise, taxBasis: input.taxBasis, startsAt: rule.starts_at, endsAt: rule.ends_at }, requestId: a.requestId });
    }
    return { rule: priceView(rule) };
  }

  async function publish(dealerId: string, only: number[] | undefined, a: AdminActor, event: string) {
    const [draftsAll, actives] = await Promise.all([repo.listRules(dealerId, { statuses: ["draft"] }), repo.listRules(dealerId, { statuses: ["active"] })]);
    const drafts = only ? draftsAll.filter((d) => only.includes(d.odoo_variant_id)) : draftsAll;
    if (drafts.length === 0) throw new DealerError("VALIDATION", "There are no draft prices to publish");
    const plan = planPublish(drafts, actives, now());
    await repo.applyPricePlan(dealerId, plan);
    const t = now();
    await audit({
      dealerId,
      actorType: "admin",
      actorId: a.id,
      event,
      entity: "price_rule",
      oldValue: drafts.map((d) => ({ variantId: d.odoo_variant_id, pricePaise: resolveActiveRule(actives, d.odoo_variant_id, t)?.unit_price_paise ?? null })),
      newValue: drafts.map((d) => ({ variantId: d.odoo_variant_id, pricePaise: d.unit_price_paise, taxBasis: d.tax_basis, startsAt: d.starts_at, endsAt: d.ends_at })),
      requestId: a.requestId,
    });
    return { published: drafts.length, expired: plan.expireIds.length };
  }

  async function resolveImport(dealerId: string, csv: string) {
    const parsed = parsePriceCsv(csv);
    if (parsed.fatal) return { fatal: parsed.fatal, rows: [] as ImportRow[], summary: { total: 0, ok: 0, errors: 0 } };
    const [access, rules] = await Promise.all([repo.listAccess(dealerId), repo.listRules(dealerId, { statuses: ["active"] })]);
    const t = now();
    const skus = [...new Set(parsed.rows.map((r) => r.sku).filter(Boolean))];
    const found = await wrapOdoo(() => odoo.findVariantsBySku(skus));
    const seen = new Set<number>();
    const rows: ImportRow[] = parsed.rows.map((r) => {
      const errors = [...r.errors];
      const matches = found.get(r.sku) ?? [];
      let variant: OdooVariantInfo | null = null;
      if (r.sku && matches.length === 0) errors.push(`SKU "${r.sku}" was not found in the catalogue`);
      else if (matches.length > 1) errors.push(`SKU "${r.sku}" matches ${matches.length} variants — use a variant-level SKU`);
      else if (matches.length === 1) variant = matches[0];
      if (variant && !variant.purchasable) errors.push(`${variant.name} is not available in the catalogue (archived or unpublished)`);
      if (variant) {
        if (seen.has(variant.variantId)) errors.push("This product appears more than once in the file");
        seen.add(variant.variantId);
      }
      const current = variant ? resolveActiveRule(rules, variant.variantId, t) : null;
      const newPricePaise = r.priceRupees !== null ? rupeesToPaise(r.priceRupees) : null;
      const taxBasis = r.taxBasis ?? current?.tax_basis ?? "exclusive";
      const assigned = variant ? access.some((x) => x.odoo_variant_id === variant!.variantId) : false;
      const action: ImportRow["action"] = errors.length ? "error" : !current ? "create" : current.unit_price_paise === newPricePaise && current.tax_basis === taxBasis && !r.startsAt && !r.endsAt ? "unchanged" : "update";
      return {
        line: r.line,
        sku: r.sku,
        status: errors.length ? "error" : "ok",
        errors,
        productName: variant?.name ?? null,
        variantId: variant?.variantId ?? null,
        assigned,
        currentPricePaise: current?.unit_price_paise ?? null,
        newPricePaise,
        taxBasis,
        minQty: r.minQty,
        qtyMultiple: r.qtyMultiple,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        note: r.note,
        action,
      };
    });
    const errorCount = rows.filter((r) => r.status === "error").length;
    return { fatal: null, rows, summary: { total: rows.length, ok: rows.length - errorCount, errors: errorCount } };
  }

  // ------------------------------------------------------------------------------------------
  // DEALER actions — identity always comes from the session
  // ------------------------------------------------------------------------------------------

  const dealerActions: Record<string, DealerHandler> = {
    me: async (s) => {
      const { dealer } = s;
      const [branding, access, rules, cart, orders] = await Promise.all([repo.getBranding(dealer.id), repo.listAccess(dealer.id), repo.listRules(dealer.id, { statuses: ["active"] }), repo.listCart(dealer.id), repo.listOrders({ dealerId: dealer.id, offset: 0, limit: 5 })]);
      const t = now();
      const visible = access.filter((a) => a.is_visible);
      const orderable = visible.filter((a) => a.is_orderable && resolveActiveRule(rules, a.odoo_variant_id, t)).length;
      const counts = await repo.countOrdersByStatus(dealer.id);
      const open = (counts.pending_sync ?? 0) + (counts.quotation ?? 0) + (counts.confirmed ?? 0);
      let featured: Awaited<ReturnType<typeof buildCatalog>>["items"] = [];
      try {
        featured = (await buildCatalog(dealer, { page: 1, pageSize: 4, featuredOnly: true })).items;
      } catch {
        /* the dashboard still renders without the featured strip */
      }
      return {
        dealer: { code: dealer.dealer_code, displayName: dealer.display_name, legalName: dealer.legal_name, status: dealer.status },
        user: { email: s.user.email },
        branding: branding ? { logoPath: branding.logo_path, coverPath: branding.cover_path, accentColor: branding.accent_color, tagline: branding.tagline, welcomeText: branding.welcome_text } : null,
        stats: { assignedProducts: visible.length, orderableProducts: orderable, totalOrders: Object.values(counts).reduce((x, y) => x + y, 0), openOrders: open, cartLines: cart.length },
        recentOrders: orders.rows.map(orderView),
        featured,
      };
    },

    "catalog.list": async (s, p) => {
      const { page, pageSize } = pageParams(p, 12, 48);
      return buildCatalog(s.dealer, { q: optStr(p, "q", 100), page, pageSize });
    },

    "catalog.get": async (s, p) => {
      const templateId = reqInt(p, "templateId");
      const res = await buildCatalog(s.dealer, { page: 1, pageSize: 1, templateId });
      // Unassigned / hidden / unpublished are all the same safe 404 — never a hint that it exists.
      if (res.items.length === 0) throw new DealerError("NOT_FOUND", "Product not found");
      return { product: res.items[0] };
    },

    "cart.get": async (s) => {
      const { quote, variants } = await quoteForCart(s.dealer);
      return { quote: await decorateQuote(quote, variants) };
    },

    "cart.setItem": async (s, p) => {
      const variantId = reqInt(p, "variantId");
      const quantity = reqInt(p, "quantity", 0, MAX_CART_QTY, "Quantity");
      const dealerId = s.dealer.id;
      if (quantity === 0) {
        await repo.deleteCartItem(dealerId, variantId);
        return dealerActions["cart.get"](s, {});
      }
      const [access, rules, cart] = await Promise.all([repo.listAccess(dealerId), repo.listRules(dealerId, { statuses: ["active"] }), repo.listCart(dealerId)]);
      const row = access.find((a) => a.odoo_variant_id === variantId && a.is_visible);
      // Assignment is re-validated on every write: a variant that isn't this dealer's is indistinguishable from one that doesn't exist.
      if (!row) throw new DealerError("NOT_FOUND", "Product not found");
      if (!row.is_orderable) throw new DealerError("VALIDATION", "This product can't be ordered right now");
      if (quantity < row.minimum_quantity) throw new DealerError("VALIDATION", `Minimum order quantity is ${row.minimum_quantity}`);
      if (quantity % row.quantity_multiple !== 0) throw new DealerError("VALIDATION", `Quantity must be a multiple of ${row.quantity_multiple}`);
      const rule = resolveActiveRule(rules, variantId, now());
      if (!rule) throw new DealerError("VALIDATION", "Pricing for this product isn't available — it can't be ordered yet");
      if (!cart.some((c) => c.odoo_variant_id === variantId) && cart.length >= MAX_CART_LINES) throw new DealerError("VALIDATION", `A cart can hold at most ${MAX_CART_LINES} different products`);
      const info = (await variantInfoOrThrow([variantId])).get(variantId);
      if (!info || !info.purchasable) throw new DealerError("VALIDATION", "This product is currently unavailable");
      await repo.upsertCartItem(dealerId, variantId, quantity, rule.unit_price_paise);
      return dealerActions["cart.get"](s, {});
    },

    "cart.acknowledge": async (s) => {
      const { quote } = await quoteForCart(s.dealer);
      const prices = new Map<number, number>();
      for (const l of quote.lines) if (l.unitPricePaise !== null) prices.set(l.variantId, l.unitPricePaise);
      await repo.setCartQuotedPrices(s.dealer.id, prices);
      return dealerActions["cart.get"](s, {});
    },

    "cart.removeInvalid": async (s) => {
      const { quote } = await quoteForCart(s.dealer);
      for (const l of quote.lines) if (l.issues.some((i) => i === "not_assigned" || i === "hidden" || i === "no_price" || i === "unavailable" || i === "not_orderable")) await repo.deleteCartItem(s.dealer.id, l.variantId);
      return dealerActions["cart.get"](s, {});
    },

    "cart.clear": async (s) => {
      await repo.clearCart(s.dealer.id);
      return dealerActions["cart.get"](s, {});
    },

    "orders.place": async (s, p) => {
      const dealer = s.dealer;
      if (dealer.status !== "active") throw new DealerError("DEALER_INACTIVE", "This account can't place orders right now");
      const key = reqStr(p, "idempotencyKey", 80, "Idempotency key");
      if (!validIdempotencyKey(key)) throw new DealerError("VALIDATION", "Invalid idempotency key");
      // Replay (double-click / back-button / network retry) resolves to the one real order.
      const replay = await repo.getOrderByKey(dealer.id, key);
      if (replay) return { order: orderView(replay), items: (await repo.listOrderItems(replay.id)).map(itemView), replayed: true, odooSynced: replay.status !== "pending_sync" };

      const accepted = reqStr(p, "acceptedFingerprint", 100, "Quote");
      const address = parseAddress(p.shippingAddress, true, "Delivery address");
      const poReference = optStr(p, "poReference", 60, "PO reference");
      const notes = optStr(p, "notes", 500, "Notes");

      const { quote } = await quoteForCart(dealer);
      if (quote.lines.length === 0) throw new DealerError("VALIDATION", "Your cart is empty");
      if (!quote.canOrder) throw new DealerError("QUOTE_INVALID", "Some items in your cart can't be ordered — review your cart", { quote });
      if (quote.fingerprint !== accepted) throw new DealerError("CHECKOUT_CHANGED", "Prices or availability changed — please review the updated total", { quote });

      const { order, created } = await repo.insertOrder(
        {
          dealer_id: dealer.id,
          idempotency_key: key,
          status: "pending_sync",
          odoo_sale_order_id: null,
          odoo_order_name: null,
          currency: "INR",
          subtotal_paise: quote.subtotalPaise,
          tax_paise: quote.taxPaise,
          shipping_paise: quote.shippingPaise,
          total_paise: quote.totalPaise,
          shipping_address: address,
          po_reference: poReference,
          notes,
          quote_fingerprint: quote.fingerprint,
          placed_by: s.user.auth_user_id,
          retry_count: 0,
          last_sync_error: null,
        },
        quote.lines.map((l) => ({
          odoo_template_id: l.templateId ?? 0,
          odoo_variant_id: l.variantId,
          sku: l.sku,
          product_name: l.name,
          quantity: l.quantity,
          unit_price_paise: l.unitPricePaise ?? 0,
          tax_basis: l.taxBasis ?? "exclusive",
          subtotal_paise: l.subtotalPaise,
          tax_paise: l.taxPaise,
          line_total_paise: l.totalPaise,
          price_rule_id: l.ruleId,
          price_rule_version: l.ruleVersion,
        }))
      );
      let items = await repo.listOrderItems(order.id);
      if (!created) return { order: orderView(order), items: items.map(itemView), replayed: true, odooSynced: order.status !== "pending_sync" };

      await audit({ dealerId: dealer.id, actorType: "dealer", actorId: s.user.auth_user_id, event: "order.placed", entity: "order", entityId: order.id, newValue: { orderNumber: order.order_number, totalPaise: order.total_paise, lines: items.length }, requestId: s.requestId });
      await repo.clearCart(dealer.id);
      const synced = await syncOrderToOdoo(dealer, order, items, { type: "dealer", id: s.user.auth_user_id });
      items = await repo.listOrderItems(order.id);
      if (deps.notifier) {
        try {
          await deps.notifier.orderPlaced({ dealer, order: synced, items });
        } catch {
          /* a failed email never fails an order */
        }
      }
      return { order: orderView(synced), items: items.map(itemView), replayed: false, odooSynced: synced.status !== "pending_sync" };
    },

    "orders.list": async (s, p) => {
      const { page, pageSize, offset } = pageParams(p, 20, 100);
      const status = optStr(p, "status", 20) as OrderStatus | null;
      const { rows, total } = await repo.listOrders({ dealerId: s.dealer.id, status: status ?? undefined, offset, limit: pageSize });
      return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), rows: rows.map(orderView) };
    },

    "orders.get": async (s, p) => {
      const order = await repo.getOrder(reqUuid(p, "id"));
      // Someone else's order is indistinguishable from a missing one.
      if (!order || order.dealer_id !== s.dealer.id) {
        if (order) await audit({ dealerId: s.dealer.id, actorType: "dealer", actorId: s.user.auth_user_id, event: "security.cross_tenant_denied", entity: "order", entityId: order.id, requestId: s.requestId });
        throw new DealerError("NOT_FOUND", "Order not found");
      }
      const refreshed = await refreshOrderStatus(s.dealer.id, order);
      return { order: orderView(refreshed), items: (await repo.listOrderItems(order.id)).map(itemView) };
    },

    "orders.reorder": async (s, p) => {
      const order = await repo.getOrder(reqUuid(p, "id"));
      if (!order || order.dealer_id !== s.dealer.id) throw new DealerError("NOT_FOUND", "Order not found");
      const items = await repo.listOrderItems(order.id);
      const [access, rules] = await Promise.all([repo.listAccess(s.dealer.id), repo.listRules(s.dealer.id, { statuses: ["active"] })]);
      const infos = await variantInfoOrThrow(items.map((i) => i.odoo_variant_id));
      const t = now();
      const added: string[] = [];
      const skipped: { name: string; reason: string }[] = [];
      for (const item of items) {
        const row = access.find((a) => a.odoo_variant_id === item.odoo_variant_id && a.is_visible && a.is_orderable);
        const rule = resolveActiveRule(rules, item.odoo_variant_id, t);
        const info = infos.get(item.odoo_variant_id);
        if (!row || !rule || !info?.purchasable) {
          skipped.push({ name: item.product_name, reason: !row ? "no longer in your catalogue" : !rule ? "no current price" : "currently unavailable" });
          continue;
        }
        const multiple = row.quantity_multiple;
        const qty = Math.min(MAX_CART_QTY, Math.max(row.minimum_quantity, Math.ceil(item.quantity / multiple) * multiple));
        await repo.upsertCartItem(s.dealer.id, item.odoo_variant_id, qty, rule.unit_price_paise);
        added.push(item.product_name);
      }
      return { added, skipped };
    },

    "account.get": async (s) => ({
      dealer: { legalName: s.dealer.legal_name, displayName: s.dealer.display_name, code: s.dealer.dealer_code, gstin: s.dealer.gstin, contactName: s.dealer.contact_name, contactEmail: s.dealer.contact_email, contactPhone: s.dealer.contact_phone, billingAddress: s.dealer.billing_address, shippingAddress: s.dealer.shipping_address },
    }),

    "account.update": async (s, p) => {
      // Dealers may change contact + delivery details only — legal name, GSTIN and billing address are Delite-managed.
      const patch: Partial<DealerRow> = {};
      if ("contactName" in p) patch.contact_name = optStr(p, "contactName", 120);
      if ("contactPhone" in p) patch.contact_phone = optPhone(p, "contactPhone");
      if ("shippingAddress" in p) patch.shipping_address = parseAddress(p.shippingAddress, false, "Delivery address");
      const updated = await repo.updateDealer(s.dealer.id, patch);
      await audit({ dealerId: s.dealer.id, actorType: "dealer", actorId: s.user.auth_user_id, event: "account.updated", entity: "dealer", entityId: s.dealer.id, oldValue: pick(s.dealer, Object.keys(patch)), newValue: pick(updated, Object.keys(patch)), requestId: s.requestId });
      return dealerActions["account.get"]({ ...s, dealer: updated }, {});
    },
  };

  // ------------------------------------------------------------------------------------------
  // dispatch + session
  // ------------------------------------------------------------------------------------------

  return {
    async callAdmin(actor, action, payload) {
      const handler = admin[action];
      const cap = adminCaps[action];
      if (!handler || !cap) throw new DealerError("NOT_FOUND", "Unknown action");
      if (!(ROLE_CAPABILITIES[actor.role] ?? []).includes(cap)) throw new DealerError("FORBIDDEN", "You don't have permission to do that");
      return handler(actor, asPayload(payload));
    },

    async callDealer(session, action, payload) {
      const handler = dealerActions[action];
      if (!handler) throw new DealerError("NOT_FOUND", "Unknown action");
      // The payload is parsed but any `dealerId` the caller sends is simply never read.
      return handler(session, asPayload(payload));
    },

    async resolveSession(authUserId, requestId) {
      const user = await repo.getDealerUserByAuthId(authUserId);
      if (!user || user.status === "disabled") {
        await audit({ dealerId: user?.dealer_id ?? null, actorType: "dealer", actorId: authUserId, event: "security.denied", entity: "dealer_session", newValue: { reason: user ? "user_disabled" : "not_a_dealer_user" }, requestId });
        throw new DealerError("FORBIDDEN", "This account doesn't have dealer access");
      }
      let dealer = await mustDealer(user.dealer_id);
      if (dealer.status === "suspended" || dealer.status === "archived") throw new DealerError("DEALER_INACTIVE", dealer.status === "suspended" ? "This dealer account is suspended. Please contact Delite." : "This dealer account is closed.");
      if (dealer.status === "draft") throw new DealerError("FORBIDDEN", "This dealer account isn't active yet");
      const t = now().toISOString();
      let current = user;
      if (user.status === "invited" || dealer.status === "invited") {
        current = await repo.updateDealerUser(user.id, { status: "active", last_login_at: t });
        if (dealer.status === "invited") dealer = await repo.updateDealer(dealer.id, { status: "active" });
        await audit({ dealerId: dealer.id, actorType: "dealer", actorId: authUserId, event: "dealer.activated", entity: "dealer", entityId: dealer.id, requestId });
      } else if (!user.last_login_at || Date.parse(t) - Date.parse(user.last_login_at) > 5 * 60 * 1000) {
        current = await repo.updateDealerUser(user.id, { last_login_at: t });
      }
      return { dealer, user: current, requestId };
    },

    async recordDenied({ actorId, reason, requestId }) {
      await audit({ dealerId: null, actorType: "dealer", actorId, event: "security.denied", entity: "dealer_session", newValue: { reason }, requestId });
    },
  };
}

interface ImportRow {
  line: number;
  sku: string;
  status: "ok" | "error";
  errors: string[];
  productName: string | null;
  variantId: number | null;
  assigned: boolean;
  currentPricePaise: number | null;
  newPricePaise: number | null;
  taxBasis: "exclusive" | "inclusive" | null;
  minQty: number | null;
  qtyMultiple: number | null;
  startsAt: string | null;
  endsAt: string | null;
  note: string | null;
  action: "create" | "update" | "unchanged" | "error";
}

function pick(obj: object, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = (obj as Record<string, unknown>)[k];
  return out;
}

export type { Address };
