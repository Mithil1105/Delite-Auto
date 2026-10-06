// supabase/functions/_shared/orders/quote.ts
//
// The ONE server-authoritative checkout quote builder — see Documentations MD/
// odoo-checkout-finalization.md Phase 5. Used by both the `checkout-quote` Edge Function (the
// customer's first quote) AND the revalidation step immediately before COD/online order placement
// (Phase 5B — "re-run the authoritative quote, compare, CHECKOUT_CHANGED on any difference").
// Calling this function twice with the same inputs a few seconds apart is the entire safety
// mechanism; there is no separate "is this still valid" check beyond "does a fresh call still
// agree". Never trusts client-sent price/discount/tax/shipping — those fields do not exist on the
// request type at all.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { odooSearchRead, type OdooConfig } from "../odoo/client.ts";
import { validateAndPriceLines, type OrderLineInput } from "./placeOdooOrder.ts";
import { computeLinePrice, type PricelistItemRule } from "../pricing/pricelistEvaluator.ts";
import { computeLineTax, type TaxRecord } from "../pricing/taxCalculator.ts";
import { CheckoutError } from "../errors/checkoutErrors.ts";

export interface QuoteLine {
  odooVariantId: number;
  odooTemplateId: number;
  name: string;
  quantity: number;
  /** Authoritative, post-pricelist, pre-discount reference price. */
  unitPrice: number;
  /** Percentage (0-100), mirrors Odoo's own sale.order.line.discount semantics. */
  discountPercent: number;
  taxIds: number[];
  subtotal: number;
  tax: number;
  total: number;
}

export interface Quote {
  fingerprint: string;
  expiresAt: string;
  currency: "INR";
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  grandTotal: number;
  deliveryMethodId: number | null;
  deliveryMethodName: string | null;
  warnings: string[];
}

export interface ComputeQuoteParams {
  config: OdooConfig;
  db: SupabaseClient;
  lines: OrderLineInput[];
  supabaseUserId?: string;
  deliveryMethodId?: number | null;
  now?: Date;
}

interface VariantExtra {
  id: number;
  taxes_id: number[];
}

interface TemplateExtra {
  id: number;
  categ_id: [number, string] | false;
}

interface DeliveryCarrierRow {
  id: number;
  name: string;
  delivery_type: string;
  fixed_price: number;
  active: boolean;
  website_published: boolean;
}

export async function computeAuthoritativeQuote(params: ComputeQuoteParams): Promise<Quote> {
  const { config, db, lines, supabaseUserId, deliveryMethodId = null, now = new Date() } = params;
  const warnings: string[] = [];

  // 1. Resolve variants + re-read live list_price/active (existing, reused — never trusts a
  // client-sent price or variant selection).
  const { resolvedLines, byId } = await validateAndPriceLines(config, lines);
  const variantIds = resolvedLines.map((l) => l.odooVariantId);
  const templateIds = [...new Set(Array.from(byId.values()).map((v) => v.product_tmpl_id[0]))];

  // 2. Extra fields validateAndPriceLines doesn't fetch: taxes_id (variant-level) + categ_id
  // (template-level, needed for category-scoped pricelist rules).
  const [variantExtras, templateExtras] = await Promise.all([
    odooSearchRead<VariantExtra>(config, "product.product", [["id", "in", variantIds]], ["id", "taxes_id"]),
    odooSearchRead<TemplateExtra>(config, "product.template", [["id", "in", templateIds]], ["id", "categ_id"]),
  ]);
  const taxesByVariant = new Map(variantExtras.map((v) => [v.id, v.taxes_id ?? []]));
  const categByTemplate = new Map(templateExtras.map((t) => [t.id, t.categ_id ? t.categ_id[0] : null]));

  // 3. Resolve the pricelist: the customer's own assigned pricelist (property_product_pricelist)
  // takes precedence when set and resolvable; otherwise the store's own active pricelist. Only one
  // ("Default (INR)") exists on this instance as of the Phase 4 audit, but this is never hardcoded.
  const pricelistId = await resolvePricelistId(config, db, supabaseUserId);
  const rules = pricelistId
    ? await odooSearchRead<PricelistItemRule>(
        config,
        "product.pricelist.item",
        [["pricelist_id", "=", pricelistId]],
        [
          "pricelist_id",
          "product_tmpl_id",
          "product_id",
          "categ_id",
          "applied_on",
          "compute_price",
          "fixed_price",
          "percent_price",
          "price_discount",
          "price_round",
          "price_surcharge",
          "price_min_margin",
          "price_max_margin",
          "min_quantity",
          "date_start",
          "date_end",
          "base",
          "base_pricelist_id",
        ],
        { limit: 500 }
      )
    : [];
  if (!pricelistId) warnings.push("no active pricelist found — using list_price for every line");

  // 4. Price + tax each line.
  const allTaxIds = [...new Set(variantExtras.flatMap((v) => v.taxes_id ?? []))];
  const taxRecords = allTaxIds.length
    ? await odooSearchRead<TaxRecord>(config, "account.tax", [["id", "in", allTaxIds]], ["id", "amount", "amount_type", "price_include"])
    : [];
  const taxById = new Map(taxRecords.map((t) => [t.id, t]));

  const quoteLines: QuoteLine[] = [];
  for (const line of resolvedLines) {
    const variant = byId.get(line.odooVariantId)!;
    const templateId = variant.product_tmpl_id[0];
    const categId = categByTemplate.get(templateId);

    const priceResult = computeLinePrice(rules, {
      variantId: line.odooVariantId,
      templateId,
      categoryIds: categId ? [categId] : [],
      quantity: line.qty,
      listPrice: variant.list_price,
      now,
    });
    if (!priceResult.ok) {
      throw new CheckoutError("PRICING_UNAVAILABLE", `${variant.name} can't be priced right now — please try again shortly`, {
        retryable: false,
      });
    }

    const taxIds = taxesByVariant.get(line.odooVariantId) ?? [];
    const lineTaxes: TaxRecord[] = taxIds.map((id) => taxById.get(id)).filter((t): t is TaxRecord => !!t);
    const taxResult = computeLineTax(priceResult.unitPrice, line.qty, priceResult.discountPercent, lineTaxes);
    if (!taxResult.ok) {
      throw new CheckoutError("PRICING_UNAVAILABLE", `${variant.name}'s tax configuration isn't supported yet — please try again shortly`, {
        retryable: false,
      });
    }

    quoteLines.push({
      odooVariantId: line.odooVariantId,
      odooTemplateId: templateId,
      name: variant.name,
      quantity: line.qty,
      unitPrice: priceResult.unitPrice,
      discountPercent: priceResult.discountPercent,
      taxIds,
      subtotal: round2(taxResult.subtotal),
      tax: round2(taxResult.tax),
      total: round2(taxResult.total),
    });
  }

  // 5. Delivery — only a carrier Odoo itself marks live (active + website_published) is ever
  // offered; fixed_price is authoritative. Never fabricated.
  const carriers = await odooSearchRead<DeliveryCarrierRow>(
    config,
    "delivery.carrier",
    [
      ["active", "=", true],
      ["website_published", "=", true],
    ],
    ["id", "name", "delivery_type", "fixed_price", "active", "website_published"]
  );
  let chosenCarrier: DeliveryCarrierRow | null = null;
  if (deliveryMethodId) {
    chosenCarrier = carriers.find((c) => c.id === deliveryMethodId) ?? null;
    if (!chosenCarrier) {
      throw new CheckoutError("DELIVERY_UNAVAILABLE", "The selected delivery method is no longer available — please choose another", {
        retryable: false,
      });
    }
  } else if (carriers.length > 0) {
    chosenCarrier = carriers[0];
  } else {
    warnings.push("no published delivery method configured in Odoo");
  }
  const shipping = round2(chosenCarrier?.fixed_price ?? 0);

  const subtotal = round2(quoteLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const discount = round2(quoteLines.reduce((s, l) => s + (l.unitPrice * l.quantity - l.subtotal), 0));
  const tax = round2(quoteLines.reduce((s, l) => s + l.tax, 0));
  const grandTotal = round2(quoteLines.reduce((s, l) => s + l.total, 0) + shipping);

  const quote: Omit<Quote, "fingerprint"> = {
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString(),
    currency: "INR",
    lines: quoteLines,
    subtotal,
    discount,
    tax,
    shipping,
    grandTotal,
    deliveryMethodId: chosenCarrier?.id ?? null,
    deliveryMethodName: chosenCarrier?.name ?? null,
    warnings,
  };

  const fingerprint = await sha256Hex(
    JSON.stringify({
      lines: quoteLines.map((l) => [l.odooVariantId, l.quantity, l.unitPrice, l.discountPercent, l.tax]),
      shipping,
      deliveryMethodId: quote.deliveryMethodId,
      grandTotal,
    })
  );

  return { ...quote, fingerprint };
}

/** Compares a freshly-recomputed quote against the one the customer accepted. Throws
 * CHECKOUT_CHANGED (carrying the new quote) on any mismatch — Phase 5B. Callers must not proceed
 * to Razorpay/Odoo order creation when this throws. */
export function assertQuoteUnchanged(freshQuote: Quote, acceptedFingerprint: string): void {
  if (freshQuote.fingerprint !== acceptedFingerprint) {
    throw new CheckoutError("CHECKOUT_CHANGED", "Your cart has changed — please review the updated total before continuing", {
      quote: freshQuote,
    });
  }
}

async function resolvePricelistId(config: OdooConfig, db: SupabaseClient, supabaseUserId?: string): Promise<number | null> {
  if (supabaseUserId) {
    const { data: profileRow } = await db.from("profiles").select("odoo_partner_id").eq("id", supabaseUserId).maybeSingle();
    const partnerId = profileRow?.odoo_partner_id as number | undefined;
    if (partnerId) {
      const [partner] = await odooSearchRead<{ id: number; property_product_pricelist: [number, string] | false }>(
        config,
        "res.partner",
        [["id", "=", partnerId]],
        ["id", "property_product_pricelist"]
      );
      if (partner?.property_product_pricelist) return partner.property_product_pricelist[0];
    }
  }
  const [defaultPricelist] = await odooSearchRead<{ id: number }>(config, "product.pricelist", [["active", "=", true]], ["id"], {
    limit: 1,
    order: "id asc",
  });
  return defaultPricelist?.id ?? null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
