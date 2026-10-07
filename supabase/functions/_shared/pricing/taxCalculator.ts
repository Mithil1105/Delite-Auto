// supabase/functions/_shared/pricing/taxCalculator.ts
//
// Computes line tax from REAL Odoo account.tax records (amount, amount_type, price_include) —
// never a hardcoded `subtotal * GST_RATE`. Per the live audit (Documentations MD/
// odoo-checkout-finalization.md), every sampled sale-use tax on the delite-auto instance uses
// amount_type "percent"; "fixed" is also implemented since it's simple, deterministic Odoo
// accounting math, not a guess. "division" (tax-included reverse computation of a different kind),
// "group" (a tax that is itself a group of sub-taxes), and "code" (an arbitrary Python formula)
// are NOT supported — none are used on real products today, and safely replicating them without
// guessing isn't possible from field data alone. Fails closed rather than silently ignoring them.

export interface TaxRecord {
  id: number;
  amount: number;
  amount_type: "percent" | "fixed" | "division" | "group" | "code";
  price_include?: boolean;
}

export interface LineTaxResult {
  ok: true;
  /** Price the customer pays per unit, before tax (after any pricelist discount). */
  subtotal: number;
  tax: number;
  total: number;
  taxBreakdown: { taxId: number; amount: number }[];
}

export interface LineTaxFailure {
  ok: false;
  reason: string;
  taxId: number;
}

/** `unitPrice`/`discountPercent` are the already pricelist-resolved values from
 * pricelistEvaluator.ts. `taxes` are the real account.tax rows attached to this product
 * (product.taxes_id), resolved by the caller. */
export function computeLineTax(
  unitPrice: number,
  quantity: number,
  discountPercent: number,
  taxes: TaxRecord[]
): LineTaxResult | LineTaxFailure {
  const lineBase = unitPrice * quantity * (1 - (discountPercent || 0) / 100);

  let taxTotal = 0;
  let taxableBase = lineBase; // adjusted below if any tax is price-included
  const breakdown: { taxId: number; amount: number }[] = [];

  for (const tax of taxes) {
    if (tax.amount_type === "percent") {
      if (tax.price_include) {
        // The given base already contains this tax — back it out rather than adding on top.
        const exclusive = lineBase / (1 + tax.amount / 100);
        const amount = lineBase - exclusive;
        breakdown.push({ taxId: tax.id, amount });
        taxTotal += amount;
        taxableBase = exclusive;
      } else {
        const amount = lineBase * (tax.amount / 100);
        breakdown.push({ taxId: tax.id, amount });
        taxTotal += amount;
      }
    } else if (tax.amount_type === "fixed") {
      // Fixed-amount taxes in Odoo are per unit of product, not per line.
      const amount = tax.amount * quantity;
      breakdown.push({ taxId: tax.id, amount });
      taxTotal += amount;
    } else {
      return { ok: false, reason: `unsupported tax amount_type "${tax.amount_type}"`, taxId: tax.id };
    }
  }

  const subtotal = taxableBase;
  return { ok: true, subtotal, tax: taxTotal, total: subtotal + taxTotal, taxBreakdown: breakdown };
}
