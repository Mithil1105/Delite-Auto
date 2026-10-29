import { callApi } from "../../../dealer/lib/transport";
import type { Address } from "../../../dealer/lib/dealerApi";

// Response shapes of the `admin-dealers` function (supabase/functions/_shared/dealer/engine.ts).

export type DealerStatus = "draft" | "invited" | "active" | "suspended" | "archived";
export type TaxBasis = "exclusive" | "inclusive";

export interface DealerListRow {
  id: string;
  dealerCode: string;
  displayName: string;
  legalName: string;
  status: DealerStatus;
  logoPath: string | null;
  accentColor: string | null;
  ownerEmail: string;
  assignedCount: number;
  lastOrderAt: string | null;
  lastLoginAt: string | null;
  updatedAt: string;
}

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
  status: DealerStatus;
  linked_odoo_partner_id: number | null;
  created_at: string;
  updated_at: string;
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

export interface DealerDetailData {
  dealer: DealerRecord;
  branding: BrandingRecord | null;
  users: { id: string; email: string; status: string; invitedAt: string; lastLoginAt: string | null }[];
  stats: { assigned: number; draftPrices: number; activePrices: number; orders: Record<string, number> };
  readiness: ReadinessIssue[];
  ready: boolean;
}

export interface PriceView {
  id: string;
  pricePaise: number;
  taxBasis: TaxBasis;
  startsAt: string | null;
  endsAt: string | null;
  note: string | null;
  version: number;
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

const a = <T>(action: string, payload: Record<string, unknown> = {}) => callApi<T>("admin-dealers", action, payload);

export const adminDealers = {
  list: (p: { search?: string; status?: string; page?: number; pageSize?: number }) => a<{ rows: DealerListRow[]; total: number; page: number; pageSize: number }>("dealers.list", p),
  get: (id: string) => a<DealerDetailData>("dealers.get", { id }),
  create: (p: Record<string, unknown>) => a<{ dealer: DealerRecord }>("dealers.create", p),
  update: (p: Record<string, unknown>) => a<{ dealer: DealerRecord }>("dealers.update", p),
  branding: (p: Record<string, unknown>) => a<{ branding: BrandingRecord }>("dealers.branding", p),
  setStatus: (id: string, status: DealerStatus) => a<{ dealer: DealerRecord }>("dealers.setStatus", { id, status }),
  bulkSuspend: (ids: string[]) => a<{ suspended: number; skipped: string[] }>("dealers.bulkSuspend", { ids, confirm: true }),
  invite: (id: string) => a<{ dealer: DealerRecord; existingAccount: boolean }>("dealers.invite", { id }),

  searchMaster: (p: { dealerId: string; q?: string; page?: number }) => a<{ items: MasterProduct[]; total: number; totalPages: number; page: number }>("catalog.searchMaster", p),
  catalog: (p: { dealerId: string; filter?: string; q?: string; page?: number; pageSize?: number }) => a<{ rows: GridRow[]; total: number; totalPages: number; page: number }>("catalog.get", p),
  assign: (dealerId: string, variantIds: number[]) => a<{ assigned: number }>("catalog.assign", { dealerId, variantIds }),
  unassign: (dealerId: string, variantIds: number[]) => a<{ removed: number }>("catalog.unassign", { dealerId, variantIds }),
  updateAccess: (p: Record<string, unknown>) => a<{ ok: boolean }>("catalog.updateAccess", p),

  saveDraft: (p: { dealerId: string; variantId: number; pricePaise: number; taxBasis: TaxBasis; startsAt?: string | null; endsAt?: string | null; note?: string | null }) => a<unknown>("prices.saveDraft", p),
  discardDraft: (dealerId: string, variantIds: number[]) => a<{ discarded: number }>("prices.discardDraft", { dealerId, variantIds }),
  publish: (dealerId: string, variantIds?: number[]) => a<{ published: number; expired: number }>("prices.publish", { dealerId, variantIds }),
  history: (dealerId: string, variantId?: number) => a<{ rules: { id: string; variantId: number; status: string; pricePaise: number; taxBasis: TaxBasis; startsAt: string | null; endsAt: string | null; note: string | null; version: number; createdAt: string }[] }>("prices.history", { dealerId, variantId }),
  revert: (dealerId: string, ruleId: string) => a<{ published: number }>("prices.revert", { dealerId, ruleId }),
  bulkAdjust: (dealerId: string, variantIds: number[], percent: number) => a<{ drafted: number; skipped: number[] }>("prices.bulkAdjust", { dealerId, variantIds, percent, confirm: true }),
  copyFrom: (dealerId: string, fromDealerId: string, withPrices: boolean) => a<{ assigned: number; drafted: number }>("prices.copyFrom", { dealerId, fromDealerId, withPrices }),
  importPreview: (dealerId: string, csv: string) => a<{ fatal: string | null; rows: ImportRow[]; summary: { total: number; ok: number; errors: number } }>("prices.importPreview", { dealerId, csv }),
  importCommit: (dealerId: string, csv: string, skipInvalid: boolean) => a<{ drafted: number; assigned: number; skipped: number }>("prices.importCommit", { dealerId, csv, skipInvalid }),
  previewCatalog: (dealerId: string, q?: string) => a<{ preview: true; dealer: { displayName: string }; branding: BrandingRecord | null; catalog: import("../../../dealer/lib/dealerApi").CatalogPage }>("preview.catalog", { dealerId, q }),

  orders: (p: { dealerId?: string; status?: string; page?: number; pageSize?: number }) => a<{ rows: AdminOrderRow[]; total: number; page: number; pageSize: number }>("orders.list", p),
  order: (id: string) => a<{ order: AdminOrderRow; items: import("../../../dealer/lib/dealerApi").OrderItem[] }>("orders.get", { id }),
  retrySync: (id: string) => a<{ synced: boolean }>("orders.retrySync", { id }),
  audit: (dealerId: string, page = 1) => a<{ rows: AuditEntry[]; total: number; page: number; pageSize: number }>("audit.list", { dealerId, page }),
};
