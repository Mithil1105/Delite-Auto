// supabase/functions/_shared/dealer/odooPort.ts
//
// OdooPort over the existing Deno Odoo client + catalog normalizers. Deno-only.
//
// Read paths reuse the SAME eligibility rules as the public storefront (CATALOG_ELIGIBILITY_DOMAIN:
// sale_ok + active + website-published), so a product archived/unpublished in Odoo is not
// purchasable by a dealer either — master availability overrides assignment (spec FR-05).
//
// The one WRITE path is createQuotation: a draft sale.order (a quotation, never auto-confirmed) with
// the dealer's contract price written explicitly into each line's price_unit. Whether Odoo SaaS
// preserves an explicit price_unit end to end MUST be proven against the live instance in Phase 0
// before pilot — see Documentations MD/dealer-portal.md ("Verification still required").

import { odooCreate, odooSearchCount, odooSearchRead, type OdooConfig } from "../odoo/client.ts";
import { buildCatalogDomain, CATALOG_ELIGIBILITY_DOMAIN, getCategoryNameMap, STORE_INVENTORY_TRACKED, TEMPLATE_LIST_FIELDS, VEHICLE_TYPE_CATEGORY_IDS } from "../odoo/catalog.ts";
import { normalizeTemplates } from "../odoo/fetch.ts";
import type { OdooProductTemplateRecord } from "../odoo/types.ts";
import type { OdooPort } from "./ports.ts";
import type { DealerRow, OdooProductSummary, OdooVariantInfo, TaxRecordLite } from "./types.ts";

interface VariantRecord {
  id: number;
  product_tmpl_id: [number, string];
  name: string;
  default_code: string | false;
  list_price: number;
  taxes_id: number[];
  product_template_attribute_value_ids: number[];
  free_qty?: number;
  qty_available?: number;
}

const VARIANT_FIELDS = ["id", "product_tmpl_id", "name", "default_code", "list_price", "taxes_id", "product_template_attribute_value_ids", "free_qty", "qty_available"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** This Odoo instance rate-limits (HTTP 429) — one polite retry, then surface the failure. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Error && /429/.test(err.message)) {
      await sleep(600);
      return fn();
    }
    throw err;
  }
}

export class OdooDealerPort implements OdooPort {
  config: OdooConfig;
  supabaseUrl: string;
  constructor(config: OdooConfig, supabaseUrl: string) {
    this.config = config;
    this.supabaseUrl = supabaseUrl;
  }

  private async toInfos(records: VariantRecord[]): Promise<Map<number, OdooVariantInfo>> {
    const out = new Map<number, OdooVariantInfo>();
    if (records.length === 0) return out;
    const templateIds = [...new Set(records.map((r) => r.product_tmpl_id[0]))];
    const eligible = new Set(
      (await odooSearchRead<{ id: number }>(this.config, "product.template", [...CATALOG_ELIGIBILITY_DOMAIN, ["id", "in", templateIds]], ["id"])).map((t) => t.id)
    );
    const taxIds = [...new Set(records.flatMap((r) => r.taxes_id ?? []))];
    const taxes = taxIds.length ? await odooSearchRead<TaxRecordLite>(this.config, "account.tax", [["id", "in", taxIds]], ["id", "amount", "amount_type", "price_include"]) : [];
    const taxById = new Map(taxes.map((t) => [t.id, t]));
    const attrIds = [...new Set(records.flatMap((r) => r.product_template_attribute_value_ids ?? []))];
    const attrs = attrIds.length ? await odooSearchRead<{ id: number; name: string; attribute_id: [number, string] }>(this.config, "product.template.attribute.value", [["id", "in", attrIds]], ["id", "name", "attribute_id"]) : [];
    const attrById = new Map(attrs.map((a) => [a.id, { attribute: a.attribute_id[1], value: a.name }]));

    for (const r of records) {
      const attributes = (r.product_template_attribute_value_ids ?? []).map((id) => attrById.get(id)).filter((a): a is { attribute: string; value: string } => !!a);
      out.set(r.id, {
        variantId: r.id,
        templateId: r.product_tmpl_id[0],
        name: attributes.length ? `${r.name} (${attributes.map((a) => a.value).join(", ")})` : r.name,
        sku: r.default_code || null,
        publicPricePaise: Math.round(r.list_price * 100),
        purchasable: eligible.has(r.product_tmpl_id[0]),
        taxes: (r.taxes_id ?? []).map((id) => taxById.get(id)).filter((t): t is TaxRecordLite => !!t),
        attributes,
        // Stock is only a gate when the store really tracks inventory (see STORE_INVENTORY_TRACKED).
        inventoryTracked: STORE_INVENTORY_TRACKED,
        inStock: STORE_INVENTORY_TRACKED ? (typeof r.free_qty === "number" ? r.free_qty : (r.qty_available ?? 0)) > 0 : undefined,
      });
    }
    return out;
  }

  async getVariantInfo(variantIds: number[]) {
    if (variantIds.length === 0) return new Map<number, OdooVariantInfo>();
    return withRetry(async () => {
      // Archived variants are excluded by Odoo's default `active` filter → absent → "unavailable".
      const records = await odooSearchRead<VariantRecord>(this.config, "product.product", [["id", "in", variantIds]], VARIANT_FIELDS);
      return this.toInfos(records);
    });
  }

  async searchProducts(q: { text?: string; templateIds?: number[]; excludeTemplateIds?: number[]; offset: number; limit: number }) {
    return withRetry(async () => {
      const domain = buildCatalogDomain({ q: q.text, ids: q.templateIds, offset: q.offset, limit: q.limit });
      if (q.excludeTemplateIds?.length) domain.push(["id", "not in", q.excludeTemplateIds]);
      const total = await odooSearchCount(this.config, "product.template", domain);
      const templates = await odooSearchRead<OdooProductTemplateRecord & Record<string, unknown>>(this.config, "product.template", domain, TEMPLATE_LIST_FIELDS, { offset: q.offset, limit: q.limit, order: "name asc" });
      const products = await normalizeTemplates(this.config, templates, { includeGallery: false, supabaseUrl: this.supabaseUrl });
      const items: OdooProductSummary[] = products.map((p) => ({
        templateId: p.odooTemplateId,
        name: p.name,
        sku: p.sku ?? null,
        imageUrl: p.primaryImage,
        categories: p.categories.map((c) => c.name),
        description: p.description,
        variants: p.variants.map((v) => ({
          variantId: v.odooVariantId,
          templateId: p.odooTemplateId,
          name: v.attributes.length ? `${v.name} (${v.attributes.map((a) => a.value).join(", ")})` : v.name,
          sku: v.sku ?? null,
          publicPricePaise: Math.round(v.price * 100),
          purchasable: v.purchasable && p.purchasable,
          // Tax rows are only loaded on the quote/order path (getVariantInfo) — a listing never prices anything.
          taxes: [],
          attributes: v.attributes,
          inventoryTracked: v.inventoryTracked,
          inStock: v.inventoryTracked ? v.inStock : undefined,
        })),
      }));
      return { items, total };
    });
  }

  async templateCategories(templateIds: number[]) {
    const out = new Map<number, { id: number; name: string }[]>();
    if (templateIds.length === 0) return out;
    return withRetry(async () => {
      const rows = await odooSearchRead<{ id: number; public_categ_ids: number[] }>(this.config, "product.template", [["id", "in", templateIds]], ["id", "public_categ_ids"]);
      const names = await getCategoryNameMap(this.config);
      const vehicleIds = new Set<number>([VEHICLE_TYPE_CATEGORY_IDS.car, VEHICLE_TYPE_CATEGORY_IDS.bike]);
      for (const r of rows) out.set(r.id, (r.public_categ_ids ?? []).filter((id) => !vehicleIds.has(id) && names.has(id)).map((id) => ({ id, name: names.get(id)! })));
      return out;
    });
  }

  async findVariantsBySku(skus: string[]) {
    const out = new Map<string, OdooVariantInfo[]>();
    if (skus.length === 0) return out;
    return withRetry(async () => {
      const byVariant = await odooSearchRead<VariantRecord>(this.config, "product.product", [["default_code", "in", skus]], VARIANT_FIELDS);
      const known = new Set(byVariant.map((v) => (v.default_code || "").toString().toLowerCase()));
      const unmatched = skus.filter((s) => !known.has(s.toLowerCase()));
      const byTemplate = unmatched.length ? await odooSearchRead<{ id: number; default_code: string }>(this.config, "product.template", [["default_code", "in", unmatched]], ["id", "default_code"]) : [];
      const templateVariants = byTemplate.length ? await odooSearchRead<VariantRecord>(this.config, "product.product", [["product_tmpl_id", "in", byTemplate.map((t) => t.id)]], VARIANT_FIELDS) : [];
      const infos = await this.toInfos([...byVariant, ...templateVariants]);
      for (const sku of skus) {
        const lower = sku.toLowerCase();
        const direct = byVariant.filter((v) => (v.default_code || "").toString().toLowerCase() === lower).map((v) => infos.get(v.id)!);
        if (direct.length) out.set(sku, direct);
        else {
          const tpl = byTemplate.filter((t) => t.default_code.toLowerCase() === lower).map((t) => t.id);
          out.set(sku, templateVariants.filter((v) => tpl.includes(v.product_tmpl_id[0])).map((v) => infos.get(v.id)!));
        }
      }
      return out;
    });
  }

  async ensurePartner(dealer: DealerRow) {
    return withRetry(async () => {
      const [existing] = await odooSearchRead<{ id: number }>(this.config, "res.partner", [["ref", "=", dealer.dealer_code]], ["id"], { limit: 1 });
      if (existing) return existing.id;
      const addr = dealer.billing_address;
      return odooCreate(this.config, "res.partner", {
        name: dealer.legal_name,
        company_type: "company",
        ref: dealer.dealer_code,
        email: dealer.contact_email,
        phone: dealer.contact_phone || false,
        vat: dealer.gstin || false,
        street: addr.line1 || false,
        street2: addr.line2 || false,
        city: addr.city || false,
        zip: addr.pincode || false,
        comment: "Delite exclusive dealer — created by the dealer portal",
      });
    });
  }

  async createQuotation(args: { partnerId: number; clientOrderRef: string; lines: { variantId: number; quantity: number; unitPrice: number }[]; note?: string }) {
    return withRetry(async () => {
      // Idempotent against a retry after a lost response: the portal's own order number is the
      // client_order_ref, so an existing quotation with that ref is reused instead of duplicated.
      const [dupe] = await odooSearchRead<{ id: number; name: string; amount_total: number }>(this.config, "sale.order", [["client_order_ref", "=", args.clientOrderRef], ["partner_id", "=", args.partnerId]], ["id", "name", "amount_total"], { limit: 1 });
      if (dupe) return { saleOrderId: dupe.id, name: dupe.name, amountTotal: dupe.amount_total };
      const saleOrderId = await odooCreate(this.config, "sale.order", {
        partner_id: args.partnerId,
        partner_invoice_id: args.partnerId,
        partner_shipping_id: args.partnerId,
        client_order_ref: args.clientOrderRef,
        note: args.note || false,
        order_line: args.lines.map((l) => [0, 0, { product_id: l.variantId, product_uom_qty: l.quantity, price_unit: l.unitPrice }]),
      });
      const [row] = await odooSearchRead<{ id: number; name: string; amount_total: number }>(this.config, "sale.order", [["id", "=", saleOrderId]], ["id", "name", "amount_total"]);
      return { saleOrderId, name: row?.name ?? "", amountTotal: row?.amount_total ?? 0 };
    });
  }

  async getOrderStates(ids: number[]) {
    if (ids.length === 0) return new Map<number, { state: string; amountTotalPaise: number }>();
    const rows = await withRetry(() => odooSearchRead<{ id: number; state: string; amount_total: number }>(this.config, "sale.order", [["id", "in", ids]], ["id", "state", "amount_total"]));
    return new Map(rows.map((r) => [r.id, { state: r.state, amountTotalPaise: Math.round(r.amount_total * 100) }]));
  }
}
