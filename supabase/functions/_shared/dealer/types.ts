// supabase/functions/_shared/dealer/types.ts
//
// Pure domain types for the dealer (B2B) portal — no Deno/Node/browser APIs, so the exact same
// engine runs in the Edge Functions, in Vitest, and in the in-browser demo backend.
// See Documentations MD/dealer-portal.md.

export type DealerStatus = "draft" | "invited" | "active" | "suspended" | "archived";
export type DealerUserStatus = "invited" | "active" | "disabled";
export type TaxBasis = "exclusive" | "inclusive";
export type PriceStatus = "draft" | "active" | "expired";
export type OrderStatus = "pending_sync" | "quotation" | "confirmed" | "completed" | "cancelled";

export interface Address {
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface DealerRow {
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
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealerUserRow {
  id: string;
  dealer_id: string;
  auth_user_id: string;
  email: string;
  role: "owner";
  status: DealerUserStatus;
  invited_at: string;
  last_login_at: string | null;
}

export interface BrandingRow {
  dealer_id: string;
  logo_path: string | null;
  cover_path: string | null;
  accent_color: string;
  tagline: string | null;
  welcome_text: string | null;
  show_public_price: boolean;
  updated_at: string;
}

export interface AccessRow {
  id: string;
  dealer_id: string;
  odoo_template_id: number;
  odoo_variant_id: number;
  sku: string | null;
  product_name: string;
  is_visible: boolean;
  is_orderable: boolean;
  minimum_quantity: number;
  quantity_multiple: number;
  featured_rank: number | null;
  updated_by: string | null;
  updated_at: string;
}

export interface PriceRuleRow {
  id: string;
  dealer_id: string;
  odoo_variant_id: number;
  unit_price_paise: number;
  currency: "INR";
  tax_basis: TaxBasis;
  starts_at: string | null;
  ends_at: string | null;
  status: PriceStatus;
  deal_note: string | null;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartItemRow {
  id: string;
  dealer_id: string;
  odoo_variant_id: number;
  quantity: number;
  quoted_price_paise: number | null;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  dealer_id: string;
  order_number: string;
  idempotency_key: string;
  status: OrderStatus;
  odoo_sale_order_id: number | null;
  odoo_order_name: string | null;
  currency: "INR";
  subtotal_paise: number;
  tax_paise: number;
  shipping_paise: number;
  total_paise: number;
  shipping_address: Address;
  po_reference: string | null;
  notes: string | null;
  quote_fingerprint: string | null;
  placed_by: string | null;
  retry_count: number;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  odoo_template_id: number;
  odoo_variant_id: number;
  sku: string | null;
  product_name: string;
  quantity: number;
  unit_price_paise: number;
  tax_basis: TaxBasis;
  subtotal_paise: number;
  tax_paise: number;
  line_total_paise: number;
  price_rule_id: string | null;
  price_rule_version: number | null;
}

export interface AuditRow {
  id: number;
  dealer_id: string | null;
  actor_type: "admin" | "dealer" | "system";
  actor_id: string | null;
  event_type: string;
  entity: string | null;
  entity_id: string | null;
  old_value: unknown;
  new_value: unknown;
  request_id: string | null;
  created_at: string;
}

export interface TaxRecordLite {
  id: number;
  amount: number;
  amount_type: "percent" | "fixed" | "division" | "group" | "code";
  price_include?: boolean;
}

/** Live Odoo facts about one sellable variant — the authoritative side of every quote. */
export interface OdooVariantInfo {
  variantId: number;
  templateId: number;
  name: string;
  sku: string | null;
  /** Public reference price (list_price) in paise — never shown to a dealer unless opted in. */
  publicPricePaise: number;
  /** Variant AND template active/sale_ok/published in Odoo (master archival overrides assignment). */
  purchasable: boolean;
  taxes: TaxRecordLite[];
  attributes: { attribute: string; value: string }[];
}

export interface OdooProductSummary {
  templateId: number;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  categories: string[];
  description?: string;
  variants: OdooVariantInfo[];
}
