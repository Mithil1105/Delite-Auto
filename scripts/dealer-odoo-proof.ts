// scripts/dealer-odoo-proof.ts
//
// "Phase 0" proof from the dealer-portal spec: does Odoo keep an EXPLICIT `price_unit` on a draft
// quotation line (instead of re-pricing from the product's list price / a pricelist), and what tax and
// total does it compute? The dealer portal's whole pricing promise depends on this.
//
// It uses the production adapter (OdooDealerPort) so the proof exercises the same calls the portal makes.
//
// WRITES TO ODOO. It creates exactly:
//   * one res.partner  tagged  ref = "ZZ-PROOF-<timestamp>", name "ZZ Delite dealer-portal proof (safe to delete)"
//   * one draft sale.order (quotation, NEVER confirmed) with client_order_ref "ZZ-PROOF-<timestamp>"
// With --cleanup it then deletes the quotation and archives the partner. Nothing else is touched.
//
// Usage (reads ODOO_* from .env.local, same as `npm run odoo:health:local`):
//   node --env-file=.env.local node_modules/vite-node/vite-node.mjs scripts/dealer-odoo-proof.ts -- --variant <product.product id> --price <rupees> --confirm-write [--cleanup]
//
// Without --confirm-write it only prints what it WOULD do and reads the variant (read-only).

import { odooExecuteKw, odooRead } from "../supabase/functions/_shared/odoo/client.ts";
import type { OdooConfig } from "../supabase/functions/_shared/odoo/client.ts";
import { OdooDealerPort } from "../supabase/functions/_shared/dealer/odooPort.ts";
import type { DealerRow } from "../supabase/functions/_shared/dealer/types.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const config: OdooConfig = {
  baseUrl: process.env.ODOO_BASE_URL ?? "",
  database: process.env.ODOO_DATABASE ?? "",
  username: process.env.ODOO_USERNAME ?? "",
  apiKey: process.env.ODOO_API_KEY ?? "",
};
if (!config.baseUrl || !config.database || !config.username || !config.apiKey) {
  console.error("ODOO_BASE_URL / ODOO_DATABASE / ODOO_USERNAME / ODOO_API_KEY are not set (use --env-file=.env.local).");
  process.exit(1);
}
const variantId = Number(value("variant"));
const priceRupees = Number(value("price"));
if (!Number.isInteger(variantId) || variantId <= 0 || !Number.isFinite(priceRupees) || priceRupees <= 0) {
  console.error("Pass --variant <product.product id> and --price <rupees>. Pick a price that differs from the product's list price.");
  process.exit(1);
}

const [variant] = await odooRead<{ id: number; display_name: string; list_price: number; taxes_id: number[] }>(config, "product.product", [variantId], ["display_name", "list_price", "taxes_id"]);
if (!variant) {
  console.error(`Variant ${variantId} not found.`);
  process.exit(1);
}
console.log(`Variant #${variant.id} "${variant.display_name}" — list price ${variant.list_price}, ${variant.taxes_id.length} tax(es).`);
if (Math.abs(variant.list_price - priceRupees) < 0.005) {
  console.error("The test price equals the list price, which proves nothing. Choose a different --price.");
  process.exit(1);
}

if (!flag("confirm-write")) {
  console.log(`\nDRY RUN. With --confirm-write this would create one tagged partner and one DRAFT quotation for 2 x variant ${variantId} at an explicit price_unit of ${priceRupees}. Re-run with --confirm-write to proceed.`);
  process.exit(0);
}

const tag = `ZZ-PROOF-${Date.now()}`;
const dealer = {
  dealer_code: tag,
  legal_name: "ZZ Delite dealer-portal proof (safe to delete)",
  contact_email: "proof@example.invalid",
  contact_phone: null,
  gstin: null,
  billing_address: { line1: "Proof only", city: "Proof", pincode: "000000" },
} as unknown as DealerRow;

const port = new OdooDealerPort(config, process.env.SUPABASE_URL ?? "");
const partnerId = await port.ensurePartner(dealer);
const quote = await port.createQuotation({ partnerId, clientOrderRef: tag, lines: [{ variantId, quantity: 2, unitPrice: priceRupees }], note: "Phase-0 proof — draft only, never confirmed" });
console.log(`Created partner #${partnerId} and quotation ${quote.name} (#${quote.saleOrderId}).`);

const [order] = await odooRead<{ id: number; state: string; amount_untaxed: number; amount_tax: number; amount_total: number; order_line: number[] }>(config, "sale.order", [quote.saleOrderId], ["state", "amount_untaxed", "amount_tax", "amount_total", "order_line"]);
const lines = await odooRead<{ price_unit: number; product_uom_qty: number; price_subtotal: number; price_tax: number; discount: number }>(config, "sale.order.line", order.order_line, ["price_unit", "product_uom_qty", "price_subtotal", "price_tax", "discount"]);

const kept = lines.every((l) => Math.abs(l.price_unit - priceRupees) < 0.005 && l.discount === 0);
const expectedSubtotal = priceRupees * 2;
console.log(JSON.stringify({ state: order.state, lines, amount_untaxed: order.amount_untaxed, amount_tax: order.amount_tax, amount_total: order.amount_total }, null, 2));
console.log(`\nRESULT price_unit preserved exactly (no discount rewrite): ${kept ? "YES" : "NO"}`);
console.log(`RESULT untaxed total ${order.amount_untaxed} vs expected ${expectedSubtotal}: ${Math.abs(order.amount_untaxed - expectedSubtotal) < 0.01 ? "MATCH" : "MISMATCH"}`);
console.log(`RESULT draft state: ${order.state === "draft" ? "YES (not confirmed)" : `NO — state is ${order.state}`}`);
console.log(`NOTE tax computed: ${order.amount_tax} (0 means the product has no tax configured in Odoo)`);

if (flag("cleanup")) {
  await odooExecuteKw(config, "sale.order", "unlink", [[quote.saleOrderId]]);
  await odooExecuteKw(config, "res.partner", "write", [[partnerId], { active: false }]);
  console.log("Cleanup done: quotation deleted, partner archived.");
} else {
  console.log(`Left in Odoo for inspection: quotation ${quote.name}, partner ref ${tag}. Re-run with --cleanup to remove next time, or delete them by hand.`);
}
process.exit(kept && order.state === "draft" ? 0 : 2);
