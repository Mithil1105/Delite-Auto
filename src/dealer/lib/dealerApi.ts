import { callApi } from "./transport";

// Response shapes of the `dealer-portal` function (see supabase/functions/_shared/dealer/engine.ts).
// Prices are integer paise everywhere; the UI only ever formats them.

export interface Address {
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export type UnavailableReason = "unavailable" | "out_of_stock" | "not_orderable" | "no_price";

export interface CatalogVariant {
  variantId: number;
  sku: string | null;
  name: string;
  attributes: { attribute: string; value: string }[];
  pricePaise: number | null;
  taxBasis: "exclusive" | "inclusive" | null;
  /** Volume pricing in force: price applies from this quantity up (first tier = base price). */
  tiers: { minQty: number; pricePaise: number }[];
  orderable: boolean;
  unavailableReason: UnavailableReason | null;
  minQty: number;
  qtyMultiple: number;
  publicPricePaise: number | null;
}

export interface CatalogProduct {
  templateId: number;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  categories: string[];
  description: string | null;
  fromPricePaise: number | null;
  variants: CatalogVariant[];
}

export interface CatalogPage {
  items: CatalogProduct[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface OrderSummary {
  id: string;
  orderNumber: string;
  status: "pending_sync" | "quotation" | "confirmed" | "completed" | "cancelled";
  odooOrderName: string | null;
  subtotalPaise: number;
  taxPaise: number;
  shippingPaise: number;
  totalPaise: number;
  shippingAddress: Address;
  poReference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  syncPending: boolean;
}

export interface OrderItem {
  variantId: number;
  templateId: number;
  sku: string | null;
  name: string;
  quantity: number;
  unitPricePaise: number;
  taxBasis: "exclusive" | "inclusive";
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
}

export type LineIssue = "out_of_stock" | "not_assigned" | "hidden" | "not_orderable" | "no_price" | "unavailable" | "below_min" | "bad_multiple" | "tax_unsupported";

export interface QuoteLine {
  variantId: number;
  templateId: number | null;
  sku: string | null;
  name: string;
  quantity: number;
  unitPricePaise: number | null;
  taxBasis: "exclusive" | "inclusive" | null;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  minQty: number;
  qtyMultiple: number;
  previousPricePaise: number | null;
  priceChanged: boolean;
  tierMinQty: number;
  issues: LineIssue[];
  imageUrl: string | null;
  attributes: { attribute: string; value: string }[];
}

export interface CreditInfo {
  limitPaise: number;
  usedPaise: number;
  availablePaise: number;
}

export interface Quote {
  fingerprint: string;
  expiresAt: string;
  lines: QuoteLine[];
  subtotalPaise: number;
  taxPaise: number;
  shippingPaise: number;
  shippingLabel: string;
  totalPaise: number;
  canOrder: boolean;
  needsAcknowledgement: boolean;
  purchaseMethod: "request_order" | "po_required";
  paymentTerms: string | null;
  credit: (CreditInfo & { wouldExceed: boolean }) | null;
}

export interface Me {
  dealer: { code: string; displayName: string; legalName: string; status: string };
  user: { email: string; role: "owner" | "buyer" };
  branding: { logoPath: string | null; coverPath: string | null; accentColor: string; tagline: string | null; welcomeText: string | null } | null;
  terms: { purchaseMethod: "request_order" | "po_required"; paymentTerms: string | null; shippingLabel: string };
  credit: CreditInfo | null;
  offers: { id: string; title: string; body: string | null; endsAt: string | null }[];
  stats: { assignedProducts: number; orderableProducts: number; totalOrders: number; openOrders: number; cartLines: number };
  recentOrders: OrderSummary[];
  featured: CatalogProduct[];
}

export interface AccountInfo {
  legalName: string;
  displayName: string;
  code: string;
  gstin: string | null;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  billingAddress: Address;
  shippingAddress: Address;
  paymentTerms: string | null;
  purchaseMethod: "request_order" | "po_required";
}

export interface Insights {
  days: number;
  orders: number;
  spendPaise: number;
  averageOrderPaise: number;
  monthly: { month: string; spendPaise: number }[];
  topProducts: { name: string; qty: number; spendPaise: number }[];
}

export interface TeamUser {
  id: string;
  email: string;
  role: "owner" | "buyer";
  status: "invited" | "active" | "disabled";
  lastLoginAt: string | null;
  isYou: boolean;
}

export const dealerApi = {
  me: () => callApi<Me>("dealer-portal", "me"),
  catalog: (p: { q?: string; page?: number; pageSize?: number; categoryId?: number }) => callApi<CatalogPage>("dealer-portal", "catalog.list", p),
  categories: () => callApi<{ categories: { id: number; name: string; count: number }[] }>("dealer-portal", "catalog.categories"),
  product: (templateId: number) => callApi<{ product: CatalogProduct }>("dealer-portal", "catalog.get", { templateId }),
  cart: () => callApi<{ quote: Quote }>("dealer-portal", "cart.get"),
  setItem: (variantId: number, quantity: number) => callApi<{ quote: Quote }>("dealer-portal", "cart.setItem", { variantId, quantity }),
  acknowledge: () => callApi<{ quote: Quote }>("dealer-portal", "cart.acknowledge"),
  removeInvalid: () => callApi<{ quote: Quote }>("dealer-portal", "cart.removeInvalid"),
  clearCart: () => callApi<{ quote: Quote }>("dealer-portal", "cart.clear"),
  placeOrder: (p: { idempotencyKey: string; acceptedFingerprint: string; shippingAddress: Address; poReference?: string; notes?: string }) =>
    callApi<{ order: OrderSummary; items: OrderItem[]; replayed: boolean; odooSynced: boolean }>("dealer-portal", "orders.place", p),
  orders: (p: { page?: number; pageSize?: number; status?: string }) => callApi<{ rows: OrderSummary[]; total: number; page: number; totalPages: number }>("dealer-portal", "orders.list", p),
  order: (id: string) =>
    callApi<{ order: OrderSummary; items: OrderItem[]; dealer: { legalName: string; displayName: string; gstin: string | null; billingAddress: Address; paymentTerms: string | null } }>("dealer-portal", "orders.get", { id }),
  reorder: (id: string) => callApi<{ added: string[]; skipped: { name: string; reason: string }[] }>("dealer-portal", "orders.reorder", { id }),
  insights: (days = 90) => callApi<Insights>("dealer-portal", "insights", { days }),
  team: () => callApi<{ canManage: boolean; users: TeamUser[] }>("dealer-portal", "team.list"),
  inviteTeamUser: (email: string) => callApi<{ user: { id: string } }>("dealer-portal", "team.invite", { email }),
  setTeamUserStatus: (userId: string, status: "active" | "disabled") => callApi<{ user: { id: string; status: string } }>("dealer-portal", "team.setStatus", { userId, status }),
  account: () => callApi<{ dealer: AccountInfo; role: "owner" | "buyer" }>("dealer-portal", "account.get"),
  updateAccount: (p: { contactName?: string | null; contactPhone?: string | null; shippingAddress?: Address }) => callApi<{ dealer: AccountInfo; role: "owner" | "buyer" }>("dealer-portal", "account.update", p),
};
