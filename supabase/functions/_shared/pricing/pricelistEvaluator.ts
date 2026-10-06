// supabase/functions/_shared/pricing/pricelistEvaluator.ts
//
// A bounded, Odoo-pricelist-COMPATIBLE evaluator — not a reimplementation of Odoo's full pricing
// engine. Built per Documentations MD/odoo-checkout-finalization.md Phase 4B: the live Odoo
// instance's `sale.order.line.onchange` RPC was tested and did not return a usable computed value
// without a full order context (see that doc), so a safe native RPC pricing path could not be
// proven. This module exists to replace the previous, confirmed-wrong `price_unit = list_price`
// assignment in `_shared/orders/placeOdooOrder.ts`.
//
// Scope is deliberately narrow: it supports EXACTLY the `product.pricelist.item` rule shapes
// found active in the real `delite-auto` Odoo instance (live audit, see the doc above) —
//   - applied_on: "0_product_variant" | "1_product" | "2_product_category" | "3_global"
//   - compute_price: "fixed" | "formula" (base: "list_price" only), with
//     price_round / price_surcharge / price_min_margin / price_max_margin all exactly 0
//   - min_quantity, date_start/date_end
// Anything outside that — compute_price "percentage", base "standard_price"/"pricelist", any
// nonzero round/surcharge/margin, multiple applicable rules we can't safely rank — is NOT guessed
// at. `evaluateLinePrice` returns `{ ok: false }` for those, and callers MUST fail the line
// (PRICING_UNAVAILABLE) rather than silently falling back to `list_price`. A product with NO
// matching pricelist rule at all is not a failure — that's Odoo's own well-defined default
// behavior (the pricelist simply doesn't touch that product's price), so it correctly resolves to
// plain `list_price`, discount 0.

export interface PricelistItemRule {
  id: number;
  pricelist_id: [number, string] | false;
  product_tmpl_id: [number, string] | false;
  product_id: [number, string] | false;
  categ_id: [number, string] | false;
  applied_on: "3_global" | "2_product_category" | "1_product" | "0_product_variant";
  compute_price: "fixed" | "percentage" | "formula";
  fixed_price: number;
  percent_price: number;
  price_discount: number;
  price_round: number;
  price_surcharge: number;
  price_min_margin: number;
  price_max_margin: number;
  min_quantity: number;
  date_start: string | false;
  date_end: false | string;
  base: "list_price" | "standard_price" | "pricelist";
  base_pricelist_id: [number, string] | false;
}

export interface LinePriceContext {
  variantId: number;
  templateId: number;
  categoryIds: number[];
  quantity: number;
  listPrice: number;
  /** ISO datetime to evaluate date_start/date_end against — pass the real request time; a fixed
   * value here would let a stale quote silently keep an expired promo alive. */
  now: Date;
}

export type LinePriceResult =
  | { ok: true; unitPrice: number; discountPercent: number; ruleId: number | null; ruleApplied: "none" | "fixed" | "formula" }
  | { ok: false; reason: string; ruleId: number };

const SPECIFICITY_RANK: Record<PricelistItemRule["applied_on"], number> = {
  "0_product_variant": 0,
  "1_product": 1,
  "2_product_category": 2,
  "3_global": 3,
};

function withinDateWindow(rule: PricelistItemRule, now: Date): boolean {
  if (rule.date_start && new Date(rule.date_start).getTime() > now.getTime()) return false;
  if (rule.date_end && new Date(rule.date_end).getTime() < now.getTime()) return false;
  return true;
}

function matchesScope(rule: PricelistItemRule, ctx: LinePriceContext): boolean {
  switch (rule.applied_on) {
    case "0_product_variant":
      return rule.product_id !== false && rule.product_id[0] === ctx.variantId;
    case "1_product":
      return rule.product_tmpl_id !== false && rule.product_tmpl_id[0] === ctx.templateId;
    case "2_product_category":
      return rule.categ_id !== false && ctx.categoryIds.includes(rule.categ_id[0]);
    case "3_global":
      return true;
  }
}

/** Picks the single best-matching rule for this line, mirroring Odoo's own precedence: more
 * specific scope wins (variant > product > category > global); within the same scope, the
 * highest `min_quantity` that the requested quantity still satisfies wins (a "buy 10+" rule beats
 * a "buy 1+" rule when qty=12). Returns null when nothing matches — the normal/default case. */
export function selectPricelistRule(rules: PricelistItemRule[], ctx: LinePriceContext): PricelistItemRule | null {
  const candidates = rules.filter(
    (r) => matchesScope(r, ctx) && withinDateWindow(r, ctx.now) && ctx.quantity >= (r.min_quantity || 0)
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const specDiff = SPECIFICITY_RANK[a.applied_on] - SPECIFICITY_RANK[b.applied_on];
    if (specDiff !== 0) return specDiff;
    return (b.min_quantity || 0) - (a.min_quantity || 0);
  });
  return candidates[0];
}

/** Evaluates ONE already-selected rule against the line's list price. Fails closed (ok:false) for
 * any shape not proven safe — see file header. Never throws; callers decide how to surface a
 * failure (PRICING_UNAVAILABLE). */
export function evaluateLinePrice(rule: PricelistItemRule | null, ctx: LinePriceContext): LinePriceResult {
  if (!rule) return { ok: true, unitPrice: ctx.listPrice, discountPercent: 0, ruleId: null, ruleApplied: "none" };

  if (rule.base !== "list_price") {
    return { ok: false, reason: `unsupported pricelist base "${rule.base}" (only "list_price" is supported)`, ruleId: rule.id };
  }
  if (rule.price_round !== 0 || rule.price_surcharge !== 0 || rule.price_min_margin !== 0 || rule.price_max_margin !== 0) {
    return { ok: false, reason: "pricelist rule uses rounding/surcharge/margin fields, which are not supported", ruleId: rule.id };
  }

  if (rule.compute_price === "fixed") {
    return { ok: true, unitPrice: rule.fixed_price, discountPercent: 0, ruleId: rule.id, ruleApplied: "fixed" };
  }

  if (rule.compute_price === "formula") {
    const discountPercent = rule.price_discount || 0;
    return { ok: true, unitPrice: ctx.listPrice, discountPercent, ruleId: rule.id, ruleApplied: "formula" };
  }

  // compute_price === "percentage" — not proven active on this instance; never guessed.
  return { ok: false, reason: `unsupported pricelist compute_price "${rule.compute_price}"`, ruleId: rule.id };
}

/** Convenience wrapper: select + evaluate in one call. */
export function computeLinePrice(rules: PricelistItemRule[], ctx: LinePriceContext): LinePriceResult {
  const rule = selectPricelistRule(rules, ctx);
  return evaluateLinePrice(rule, ctx);
}
