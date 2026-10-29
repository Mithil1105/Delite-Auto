// supabase/functions/_shared/dealer/quote.ts
//
// The ONE dealer quote builder (spec FR-07). Pure: it is handed the dealer's entitlements, price
// rules and the LIVE Odoo facts, and decides price/tax/eligibility per line. The browser never
// sends a price — it sends variant ids and quantities only. Used both for the dealer's on-screen
// quote and, re-run immediately before placement, to detect any change (CHECKOUT_CHANGED).

import { resolveActiveRule } from "./pricing.ts";
import type { AccessRow, OdooVariantInfo, PriceRuleRow, TaxBasis, TaxRecordLite } from "./types.ts";

export type LineIssue = "not_assigned" | "hidden" | "not_orderable" | "no_price" | "unavailable" | "below_min" | "bad_multiple" | "tax_unsupported";

export interface QuoteLineInput {
  variantId: number;
  quantity: number;
  /** Unit price (paise) the dealer last saw for this line, if any — drives the old→new notice. */
  quotedPricePaise?: number | null;
}

export interface DealerQuoteLine {
  variantId: number;
  templateId: number | null;
  sku: string | null;
  name: string;
  quantity: number;
  unitPricePaise: number | null;
  taxBasis: TaxBasis | null;
  ruleId: string | null;
  ruleVersion: number | null;
  /** What gets written to the Odoo sale.order.line price_unit (rupees). */
  odooUnitPrice: number | null;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  minQty: number;
  qtyMultiple: number;
  previousPricePaise: number | null;
  priceChanged: boolean;
  issues: LineIssue[];
}

export interface DealerQuote {
  fingerprint: string;
  expiresAt: string;
  currency: "INR";
  lines: DealerQuoteLine[];
  subtotalPaise: number;
  taxPaise: number;
  shippingPaise: number;
  totalPaise: number;
  canOrder: boolean;
  /** True when any line's price differs from what the dealer last saw — needs acknowledgment. */
  needsAcknowledgement: boolean;
}

export interface LineMoney {
  ok: boolean;
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
  odooUnitPrice: number;
}

/** Tax for one line from REAL Odoo account.tax rows. Supports percent and fixed taxes; any other
 * shape fails closed (same stance as pricing/taxCalculator.ts). For an INCLUSIVE contract price the
 * line total is exactly unit × qty; for an EXCLUSIVE one the subtotal is exactly unit × qty. */
export function computeLineMoney(unitPaise: number, quantity: number, basis: TaxBasis, taxes: TaxRecordLite[]): LineMoney {
  const fail: LineMoney = { ok: false, subtotalPaise: 0, taxPaise: 0, totalPaise: 0, odooUnitPrice: 0 };
  let percentSum = 0;
  let fixedPerUnit = 0;
  let includedCount = 0;
  for (const tax of taxes) {
    if (tax.amount_type === "percent") percentSum += tax.amount;
    else if (tax.amount_type === "fixed") {
      if (tax.price_include) return fail;
      fixedPerUnit += tax.amount;
    } else return fail;
    if (tax.price_include) includedCount++;
  }
  if (includedCount !== 0 && includedCount !== taxes.length) return fail; // mixed included/excluded: unsupported
  const odooTaxIncluded = includedCount > 0;
  const rate = percentSum / 100;

  let subtotalPaise: number;
  let taxPaise: number;
  let totalPaise: number;
  if (basis === "exclusive") {
    subtotalPaise = unitPaise * quantity;
    taxPaise = Math.round(subtotalPaise * rate) + Math.round(fixedPerUnit * 100) * quantity;
    totalPaise = subtotalPaise + taxPaise;
  } else {
    totalPaise = unitPaise * quantity;
    const fixedTotal = Math.round(fixedPerUnit * 100) * quantity;
    subtotalPaise = Math.round((totalPaise - fixedTotal) / (1 + rate));
    taxPaise = totalPaise - subtotalPaise;
  }

  const exclusiveUnit = subtotalPaise / quantity / 100;
  const odooUnitPrice = Math.round((odooTaxIncluded ? exclusiveUnit * (1 + rate) : exclusiveUnit) * 10_000) / 10_000;
  return { ok: true, subtotalPaise, taxPaise, totalPaise, odooUnitPrice };
}

export interface BuildQuoteArgs {
  lines: QuoteLineInput[];
  access: AccessRow[];
  rules: PriceRuleRow[];
  variants: Map<number, OdooVariantInfo>;
  now: Date;
  shippingPaise?: number;
}

export async function buildDealerQuote(args: BuildQuoteArgs): Promise<DealerQuote> {
  const accessByVariant = new Map(args.access.map((a) => [a.odoo_variant_id, a]));
  const lines: DealerQuoteLine[] = [];

  for (const input of args.lines) {
    const access = accessByVariant.get(input.variantId);
    const info = args.variants.get(input.variantId);
    const issues: LineIssue[] = [];
    const line: DealerQuoteLine = {
      variantId: input.variantId,
      templateId: access?.odoo_template_id ?? info?.templateId ?? null,
      sku: access?.sku ?? info?.sku ?? null,
      name: access?.product_name ?? info?.name ?? `Product ${input.variantId}`,
      quantity: input.quantity,
      unitPricePaise: null,
      taxBasis: null,
      ruleId: null,
      ruleVersion: null,
      odooUnitPrice: null,
      subtotalPaise: 0,
      taxPaise: 0,
      totalPaise: 0,
      minQty: access?.minimum_quantity ?? 1,
      qtyMultiple: access?.quantity_multiple ?? 1,
      previousPricePaise: input.quotedPricePaise ?? null,
      priceChanged: false,
      issues,
    };

    if (!access) issues.push("not_assigned");
    else {
      if (!access.is_visible) issues.push("hidden");
      if (!access.is_orderable) issues.push("not_orderable");
      if (input.quantity < access.minimum_quantity) issues.push("below_min");
      else if (input.quantity % access.quantity_multiple !== 0) issues.push("bad_multiple");
    }
    if (!info || !info.purchasable) issues.push("unavailable");

    const rule = access ? resolveActiveRule(args.rules, input.variantId, args.now) : null;
    if (access && !rule) issues.push("no_price");

    if (rule) {
      line.unitPricePaise = rule.unit_price_paise;
      line.taxBasis = rule.tax_basis;
      line.ruleId = rule.id;
      line.ruleVersion = rule.version;
      line.priceChanged = line.previousPricePaise !== null && line.previousPricePaise !== rule.unit_price_paise;
      if (info) {
        const money = computeLineMoney(rule.unit_price_paise, input.quantity, rule.tax_basis, info.taxes);
        if (!money.ok) issues.push("tax_unsupported");
        else {
          line.subtotalPaise = money.subtotalPaise;
          line.taxPaise = money.taxPaise;
          line.totalPaise = money.totalPaise;
          line.odooUnitPrice = money.odooUnitPrice;
        }
      }
    }
    lines.push(line);
  }

  const subtotalPaise = lines.reduce((s, l) => s + l.subtotalPaise, 0);
  const taxPaise = lines.reduce((s, l) => s + l.taxPaise, 0);
  const shippingPaise = args.shippingPaise ?? 0;
  const totalPaise = subtotalPaise + taxPaise + shippingPaise;
  const canOrder = lines.length > 0 && lines.every((l) => l.issues.length === 0);
  const needsAcknowledgement = lines.some((l) => l.priceChanged);

  const fingerprint = await sha256Hex(
    JSON.stringify({
      lines: lines.map((l) => [l.variantId, l.quantity, l.unitPricePaise, l.taxBasis, l.taxPaise, l.totalPaise, l.issues]),
      shippingPaise,
      totalPaise,
    })
  );

  return {
    fingerprint,
    expiresAt: new Date(args.now.getTime() + 15 * 60 * 1000).toISOString(),
    currency: "INR",
    lines,
    subtotalPaise,
    taxPaise,
    shippingPaise,
    totalPaise,
    canOrder,
    needsAcknowledgement,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
