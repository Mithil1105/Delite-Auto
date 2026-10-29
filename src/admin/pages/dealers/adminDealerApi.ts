import { callApi } from "../../../dealer/lib/transport";
import type { Address, CatalogPage, OrderItem } from "../../../dealer/lib/dealerApi";

// Response shapes of the `admin-dealers` function (supabase/functions/_shared/dealer/engine.ts).

export type DealerStatus = "draft" | "invited" | "active" | "suspended" | "archived";
export type TaxBasis = "exclusive" | "inclusive";
export type PortalMode = "off" | "pilot" | "on";

export interface DealerListRow {
  id: string;
  dealerCode: string;
  displayName: string;
  legalName: string;
  status: DealerStatus;
  isPilot: boolean;
  logoPath: string | null;
  accentColor: string | null;
  ownerEmail: string;
  assignedCount: number;
  lastOrderAt: string | null;
  lastLoginAt: string | null;
  updatedAt: string;
}

export type SortKey = "name" | "status" | "code" | "created" | "updated";

export interface DealerRecord {
  id: string;
  dealer_code: string;
  legal_name: string;
  display_name: string;
  contact_name: string | null;
  contact_email: string;
  contact_phone: string | null;
  gstin: string | null;
  billing_address: Address;
  shipping_address: Address;
  currency: "INR";
  status: DealerStatus;
  linked_odoo_partner_id: number | null;
  purchase_method: "request_order" | "po_required";
  shipping_policy: "as_agreed" | "free" | "flat";
  flat_shipping_paise: number;
  payment_terms: string | null;
  credit_limit_paise: number | null;
  is_pilot: boolean;
  created_at: string;
  updated_at: string;
}

export interface Terms {
  purchaseMethod: "request_order" | "po_required";
  shippingPolicy: "as_agreed" | "free" | "flat";
  flatShippingPaise: number;
  paymentTerms: string | null;
  creditLimitPaise: number | null;
  isPilot: boolean;
}

export interface BrandingRecord {
  dealer_id: string;
  logo_path: string | null;
  cover_path: string | null;
  accent_color: string;
  tagline: string | null;
  welcome_text: string | null;
  show_public_price: boolean;
}

export interface ReadinessIssue {
  code: string;
  message: string;
  variantIds?: number[];
}

export interface DealerUserView {
  id: string;
  email: string;
  role: "owner" | "buyer";
  status: "invited" | "active" | "disabled";
  invitedAt: string;
  lastLoginAt: string | null;
}

export interface OfferView {
  id: string;
  title: string;
  body: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

export interface DealerDetailData {
  dealer: DealerRecord;
  terms: Terms;
  branding: BrandingRecord | null;
  users: DealerUserView[];
  offers: OfferView[];
  stats: { assigned: number; draftPrices: number; activePrices: number; orders: Record<string, number> };
  readiness: ReadinessIssue[];
  ready: boolean;
}

export interface PriceView {
  id: string;
  minQty: number;
  pricePaise: number;
  taxBasis: TaxBasis;
  startsAt: string | null;
  endsAt: string | null;
  note: string | null;
  version: number;
  status: "draft" | "active" | "expired";
}

export type GridState = "ok" | "missing_price" | "draft_only" | "draft_pending" | "expiring";

export interface GridRow {
  variantId: number;
  templateId: number;
  sku: string | null;
  name: string;
  isVisible: boolean;
  isOrderable: boolean;
  minQty: number;
  qtyMultiple: number;
  featuredRank: number | null;
  activePrice: PriceView | null;
  draftPrice: PriceView | null;
  tiers: PriceView[];
  state: GridState;
  publicPricePaise: number | null;
  availableInOdoo: boolean | null;
}

export interface MasterProduct {
  templateId: number;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  variants: { variantId: number; sku: string | null; name: string; attributes: { attribute: string; value: string }[]; publicPricePaise: number; purchasable: boolean; assigned: boolean }[];
}

export interface ImportRow {
  line: number;
  sku: string;
  status: "ok" | "error";
  errors: string[];
  productName: string | null;
  variantId: number | null;
  assigned: boolean;
  currentPricePaise: number | null;
  newPricePaise: number | null;
  taxBasis: TaxBasis | null;
  tierQty: number;
  action: "create" | "update" | "unchanged" | "error";
}

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: "pending_sync" | "quotation" | "confirmed" | "completed" | "cancelled";
  odooOrderName: string | null;
  totalPaise: number;
  subtotalPaise: number;
  taxPaise: number;
  poReference: string | null;
  createdAt: string;
  dealerId: string;
  dealerName: string;
  lastSyncError: string | null;
  retryCount: number;
  syncPending: boolean;
  shippingAddress: Address;
  notes: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  actorType: string;
  actorId: string | null;
  event: string;
  entity: string | null;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
}

export interface ReconcileReport {
  checkedAt: string;
  checked: number;
  odooReachable: boolean;
  issues: { orderId: string; orderNumber: string; dealerName: string; kind: string; detail: string }[];
}

export interface ManagerView {
  userId: string;
  name: string | null;
  dealerIds: string[] | null;
  hasGrant: boolean;
  canManagePricing: boolean;
}

const a = <T>(action: string, payload: Record<string, unknown> = {}) => callApi<T>("admin-dealers", action, payload);

export const adminDealers = {
  list: (p: { search?: string; status?: string; page?: number; pageSize?: number; sortBy?: SortKey; sortDir?: "asc" | "desc" }) => a<{ rows: DealerListRow[]; total: number; page: number; pageSize: number }>("dealers.list", p),
  get: (id: string) => a<DealerDetailData>("dealers.get", { id }),
  create: (p: Record<string, unknown>) => a<{ dealer: DealerRecord }>("dealers.create", p),
  update: (p: Record<string, unknown>) => a<{ dealer: DealerRecord; terms: Terms }>("dealers.update", p),
  branding: (p: Record<string, unknown>) => a<{ branding: BrandingRecord }>("dealers.branding", p),
  setStatus: (id: string, status: DealerStatus) => a<{ dealer: DealerRecord }>("dealers.setStatus", { id, status }),
  bulkSuspend: (ids: string[]) => a<{ suspended: number; skipped: string[] }>("dealers.bulkSuspend", { ids, confirm: true }),
  invite: (id: string) => a<{ dealer: DealerRecord; existingAccount: boolean }>("dealers.invite", { id }),
  addUser: (id: string, email: string) => a<{ user: { id: string } }>("dealers.addUser", { id, email }),
  setUserStatus: (id: string, userId: string, status: "active" | "disabled") => a<{ user: { id: string; status: string } }>("dealers.setUserStatus", { id, userId, status }),
  sendReset: (id: string, userId: string) => a<{ sent: boolean }>("dealers.sendReset", { id, userId }),
  revokeSessions: (id: string) => a<{ revoked: number }>("dealers.revokeSessions", { id }),
  saveOffer: (p: { dealerId: string; title: string; body?: string; startsAt?: string; endsAt?: string }) => a<{ offer: OfferView }>("offers.save", p),
  deleteOffer: (dealerId: string, offerId: string) => a<{ ok: boolean }>("offers.delete", { dealerId, offerId }),

  searchMaster: (p: { dealerId: string; q?: string; page?: number; unassignedOnly?: boolean }) => a<{ items: MasterProduct[]; total: number; totalPages: number; page: number }>("catalog.searchMaster", p),
  catalog: (p: { dealerId: string; filter?: string; q?: string; page?: number; pageSize?: number }) => a<{ rows: GridRow[]; total: number; totalPages: number; page: number }>("catalog.get", p),
  assign: (dealerId: string, variantIds: number[]) => a<{ assigned: number }>("catalog.assign", { dealerId, variantIds }),
  unassign: (dealerId: string, variantIds: number[]) => a<{ removed: number }>("catalog.unassign", { dealerId, variantIds }),
  updateAccess: (p: Record<string, unknown>) => a<{ ok: boolean }>("catalog.updateAccess", p),

  saveDraft: (p: { dealerId: string; variantId: number; pricePaise: number; taxBasis: TaxBasis; startsAt?: string | null; endsAt?: string | null; note?: string | null; minQuantity?: number }) => a<unknown>("prices.saveDraft", p),
  discardDraft: (dealerId: string, variantIds: number[]) => a<{ discarded: number }>("prices.discardDraft", { dealerId, variantIds }),
  removeTier: (dealerId: string, ruleId: string) => a<{ ok: boolean }>("prices.removeTier", { dealerId, ruleId }),
  applyToVariants: (dealerId: string, variantId: number, minQuantity?: number) => a<{ drafted: number }>("prices.applyToVariants", { dealerId, variantId, minQuantity }),
  publish: (dealerId: string, variantIds?: number[]) => a<{ published: number; expired: number }>("prices.publish", { dealerId, variantIds }),
  history: (dealerId: string, variantId?: number) => a<{ rules: { id: string; variantId: number; minQty: number; status: string; pricePaise: number; taxBasis: TaxBasis; startsAt: string | null; endsAt: string | null; note: string | null; version: number; createdAt: string }[] }>("prices.history", { dealerId, variantId }),
  revert: (dealerId: string, ruleId: string) => a<{ published: number }>("prices.revert", { dealerId, ruleId }),
  bulkAdjust: (dealerId: string, variantIds: number[], percent: number) => a<{ drafted: number; skipped: number[] }>("prices.bulkAdjust", { dealerId, variantIds, percent, confirm: true }),
  copyFrom: (dealerId: string, fromDealerId: string, withPrices: boolean) => a<{ assigned: number; drafted: number }>("prices.copyFrom", { dealerId, fromDealerId, withPrices }),
  importPreview: (dealerId: string, csv: string) => a<{ fatal: string | null; rows: ImportRow[]; summary: { total: number; ok: number; errors: number } }>("prices.importPreview", { dealerId, csv }),
  importCommit: (dealerId: string, csv: string, skipInvalid: boolean) => a<{ drafted: number; assigned: number; skipped: number }>("prices.importCommit", { dealerId, csv, skipInvalid }),
  previewCatalog: (dealerId: string, q?: string) => a<{ preview: true; dealer: { displayName: string }; branding: BrandingRecord | null; catalog: CatalogPage }>("preview.catalog", { dealerId, q }),

  orders: (p: { dealerId?: string; status?: string; page?: number; pageSize?: number }) => a<{ rows: AdminOrderRow[]; total: number; page: number; pageSize: number }>("orders.list", p),
  order: (id: string) => a<{ order: AdminOrderRow; items: OrderItem[] }>("orders.get", { id }),
  retrySync: (id: string) => a<{ synced: boolean }>("orders.retrySync", { id }),
  reconcile: () => a<ReconcileReport>("orders.reconcile"),
  audit: (dealerId: string, page = 1) => a<{ rows: AuditEntry[]; total: number; page: number; pageSize: number }>("audit.list", { dealerId, page }),

  securitySummary: () => a<{ sinceHours: number; denied: number; crossTenant: number; alert: boolean }>("security.summary"),
  portalMode: () => a<{ mode: PortalMode }>("portal.getMode"),
  setPortalMode: (mode: PortalMode) => a<{ mode: PortalMode }>("portal.setMode", { mode }),
  managers: () => a<{ managers: ManagerView[] }>("roles.listManagers"),
  setGrant: (userId: string, dealerIds: string[] | null, canManagePricing: boolean) => a<unknown>("roles.setGrant", { userId, dealerIds, canManagePricing }),
};
