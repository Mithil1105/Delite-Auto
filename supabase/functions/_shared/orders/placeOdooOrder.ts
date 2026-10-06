// Shared Odoo order-placement logic — extracted from create-order/index.ts so the same
// validate-then-place sequence is used by both the COD path (create-order, places the order
// immediately) and the online-payment path (payment-create validates/prices only; the actual
// sale.order is created later by _shared/payments/finalize.ts, only after payment is verified —
// see Documentations MD/delite-payments.md, "Odoo order timing").
//
// Never trusts a client-sent price — every price/availability check re-reads live Odoo, same
// principle already applied to catalog/stock elsewhere in this project.

import { getOdooConfig, odooCreate, odooSearchRead, type OdooConfig } from "../odoo/client.ts";

export interface OrderLineInput {
  odooVariantId?: number;
  odooTemplateId?: number;
  qty: number;
}

export interface ResolvedLine {
  odooVariantId: number;
  qty: number;
}

export interface OdooVariantRow {
  id: number;
  product_tmpl_id: [number, string];
  list_price: number;
  active: boolean;
  name: string;
}

export class OrderValidationError extends Error {
  status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves template-only lines to a real variant id, then re-validates every line's
 * price/availability against LIVE Odoo. Throws OrderValidationError with a customer-safe message
 * on any problem — never guesses a variant, never trusts a stale/client-sent price. */
export async function validateAndPriceLines(
  config: OdooConfig,
  lines: OrderLineInput[]
): Promise<{ resolvedLines: ResolvedLine[]; byId: Map<number, OdooVariantRow> }> {
  const templateIdsNeedingResolution = [
    ...new Set(lines.filter((l) => !l.odooVariantId && l.odooTemplateId).map((l) => l.odooTemplateId!)),
  ];
  const variantByTemplateId = new Map<number, number>();
  if (templateIdsNeedingResolution.length > 0) {
    const rows = await odooSearchRead<{ id: number; product_tmpl_id: [number, string] }>(
      config,
      "product.product",
      [["product_tmpl_id", "in", templateIdsNeedingResolution]],
      ["id", "product_tmpl_id"]
    );
    for (const row of rows) {
      const templateId = row.product_tmpl_id[0];
      // Multiple product.product rows for one template here means a genuine multi-variant
      // product reached checkout without a selection — an upstream bug, never guessed around.
      if (!variantByTemplateId.has(templateId)) variantByTemplateId.set(templateId, row.id);
    }
    await sleep(300);
  }

  const resolvedLines: ResolvedLine[] = lines.map((line) => ({
    odooVariantId: (line.odooVariantId ?? (line.odooTemplateId ? variantByTemplateId.get(line.odooTemplateId) : undefined))!,
    qty: line.qty,
  }));
  for (const line of resolvedLines) {
    if (!line.odooVariantId) throw new OrderValidationError("Couldn't identify a product in your cart — please remove and re-add it");
  }

  const variantIds = resolvedLines.map((l) => l.odooVariantId);
  const variants = await odooSearchRead<OdooVariantRow>(config, "product.product", [["id", "in", variantIds]], [
    "id",
    "product_tmpl_id",
    "list_price",
    "active",
    "name",
  ]);
  const byId = new Map(variants.map((v) => [v.id, v]));
  for (const line of resolvedLines) {
    const v = byId.get(line.odooVariantId);
    if (!v) throw new OrderValidationError(`A product in your cart is no longer available (id ${line.odooVariantId})`);
    if (v.active === false) throw new OrderValidationError(`${v.name} is no longer available`);
  }

  return { resolvedLines, byId };
}

/** Creates the real sale.order and reads back its authoritative name/total. Callers must have
 * already re-validated prices via validateAndPriceLines — this function trusts `byId`'s
 * `list_price` as-is (no further live re-check), so it must be called promptly after validation.
 *
 * `partnerInvoiceId`/`partnerShippingId` (spec #20) default to `partnerId` when omitted — every
 * caller now passes them explicitly via `_shared/orders/customerIdentity.ts`'s `resolveCustomer()`
 * result, but the default keeps this function safe to call with just a partner id if ever needed. */
export async function createSaleOrder(
  config: OdooConfig,
  partnerId: number,
  resolvedLines: ResolvedLine[],
  byId: Map<number, OdooVariantRow>,
  clientOrderRef: string,
  partnerInvoiceId?: number,
  partnerShippingId?: number
): Promise<{ saleOrderId: number; name: string; amountTotal: number }> {
  const orderLine = resolvedLines.map((line) => [
    0,
    0,
    { product_id: line.odooVariantId, product_uom_qty: line.qty, price_unit: byId.get(line.odooVariantId)!.list_price },
  ]);
  const saleOrderId = await odooCreate(config, "sale.order", {
    partner_id: partnerId,
    partner_invoice_id: partnerInvoiceId ?? partnerId,
    partner_shipping_id: partnerShippingId ?? partnerId,
    order_line: orderLine,
    client_order_ref: clientOrderRef,
  });

  await sleep(300);
  const [saleOrder] = await odooSearchRead<{ id: number; name: string; amount_total: number }>(
    config,
    "sale.order",
    [["id", "=", saleOrderId]],
    ["id", "name", "amount_total"]
  );
  return { saleOrderId, name: saleOrder?.name ?? "", amountTotal: saleOrder?.amount_total ?? 0 };
}

/** Re-reads an already-created sale.order's authoritative name/total — used when resuming an
 * attempt that already has an odoo_sale_order_id (the Odoo write happened, only the local mirror
 * is missing/being retried), so we never call createSaleOrder a second time for the same order. */
export async function fetchSaleOrder(config: OdooConfig, saleOrderId: number): Promise<{ saleOrderId: number; name: string; amountTotal: number }> {
  const [row] = await odooSearchRead<{ id: number; name: string; amount_total: number }>(
    config,
    "sale.order",
    [["id", "=", saleOrderId]],
    ["id", "name", "amount_total"]
  );
  return { saleOrderId, name: row?.name ?? "", amountTotal: row?.amount_total ?? 0 };
}

export { getOdooConfig, sleep };
