// supabase/functions/odoo-checkout-capability-audit/index.ts
//
// One-off, kept-as-re-runnable, READ-ONLY diagnostic for the Odoo-checkout-handoff/portal/returns
// architecture decision (see Documentations MD/odoo-checkout-portal-returns.md). Same trust model
// as odoo-schema/odoo-write-check/odoo-catalog-classify: x-internal-token gated, fails closed if
// the secret isn't set, never create/write/unlink, never returns secrets, and never samples
// res.partner/sale.order record data (existence/counts only) — this endpoint answers "what CAN
// this instance do", not "who are its customers".
//
// Every check below is independently try/caught so one missing module/model doesn't blank the
// whole report — an absence is reported as `installed: false` / `exists: false`, never guessed.

import { getOdooConfig, odooFieldsGet, odooSearchCount, odooSearchRead, type OdooConfig } from "../_shared/odoo/client.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

const TARGET_MODULES = [
  "website",
  "website_sale",
  "portal",
  "payment",
  "delivery",
  "stock",
  "helpdesk",
  "helpdesk_sale",
  "account",
  "account_accountant",
  "sale",
  "sale_management",
  "sale_stock",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const requiredToken = Deno.env.get("INTERNAL_DIAGNOSTICS_TOKEN");
  if (!requiredToken) return json({ error: "Diagnostics disabled: INTERNAL_DIAGNOSTICS_TOKEN is not set" }, 403);
  if (req.headers.get("x-internal-token") !== requiredToken) return json({ error: "Missing or invalid x-internal-token header" }, 403);

  const config = getOdooConfig();
  if (!config) return json({ configured: false });

  const out: Record<string, unknown> = { configured: true };

  out.modules = await safe(() => auditModules(config));
  await sleep(350);
  out.paymentProviders = await safe(() => auditPaymentProviders(config));
  await sleep(350);
  out.delivery = await safe(() => auditDelivery(config));
  await sleep(350);
  out.partners = await safe(() => auditPartners(config));
  await sleep(350);
  out.helpdesk = await safe(() => auditHelpdesk(config));
  await sleep(350);
  out.deliveryTracking = await safe(() => auditDeliveryTracking(config));
  await sleep(350);
  out.invoicing = await safe(() => auditInvoicing(config));
  await sleep(350);
  out.websiteConfig = await safe(() => auditWebsiteConfig(config));
  await sleep(350);
  out.returnCapability = await safe(() => auditReturnCapability(config));
  await sleep(350);
  out.returnWizardSafety = await safe(() => auditReturnWizardSafety(config));

  return json(out);
});

async function safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return { error: err instanceof Error ? err.message.slice(0, 300) : "unknown error" };
  }
}

/** Every installed module's name/description/author — the author check is the closest signal
 * available (via JSON-RPC alone) for "has custom code ever been installed here": a module NOT
 * authored by "Odoo S.A." that's already installed is real evidence custom-module installation is
 * possible on this instance, vs. inferring it from hosting type alone (which JSON-RPC can't see). */
async function auditModules(config: OdooConfig) {
  const installed = await odooSearchRead<{ id: number; name: string; shortdesc: string; author: string }>(
    config,
    "ir.module.module",
    [["state", "=", "installed"]],
    ["name", "shortdesc", "author"],
    { limit: 500, order: "name asc" }
  );
  const byName = new Map(installed.map((m) => [m.name, m]));
  const targets: Record<string, { installed: boolean; shortdesc?: string }> = {};
  for (const name of TARGET_MODULES) {
    const m = byName.get(name);
    targets[name] = { installed: !!m, shortdesc: m?.shortdesc };
  }
  const razorpayModules = installed.filter((m) => /razorpay/i.test(m.name) || /razorpay/i.test(m.shortdesc ?? ""));
  const nonOdooAuthored = installed.filter((m) => m.author && !/odoo s\.?a\.?/i.test(m.author) && !["Odoo Community Association (OCA)"].includes(m.author));
  return {
    totalInstalled: installed.length,
    targets,
    razorpayModules: razorpayModules.map((m) => ({ name: m.name, shortdesc: m.shortdesc, author: m.author })),
    customModuleEvidence: nonOdooAuthored.map((m) => ({ name: m.name, author: m.author })),
  };
}

/** Odoo 17+ renamed payment.acquirer -> payment.provider; try the modern name first, fall back. */
async function auditPaymentProviders(config: OdooConfig) {
  try {
    const providers = await odooSearchRead<{ id: number; name: string; code: string; state: string }>(
      config,
      "payment.provider",
      [],
      ["name", "code", "state"],
      { limit: 50 }
    );
    return { model: "payment.provider", providers };
  } catch {
    const providers = await odooSearchRead<{ id: number; name: string; provider: string; state: string }>(
      config,
      "payment.acquirer",
      [],
      ["name", "provider", "state"],
      { limit: 50 }
    );
    return { model: "payment.acquirer (legacy)", providers };
  }
}

async function auditDelivery(config: OdooConfig) {
  const total = await odooSearchCount(config, "delivery.carrier", []);
  await sleep(300);
  const sample = await odooSearchRead<{ id: number; name: string; delivery_type: string }>(
    config,
    "delivery.carrier",
    [],
    ["name", "delivery_type"],
    { limit: 10 }
  );
  return { total, sample };
}

/** Existence/count only — never a customer-data sample, matching odoo-schema's own convention. */
async function auditPartners(config: OdooConfig) {
  const total = await odooSearchCount(config, "res.partner", []);
  await sleep(300);
  const customers = await odooSearchCount(config, "res.partner", [["customer_rank", ">", 0]]);
  await sleep(300);
  const portalUsers = await safe(() => odooSearchCount(config, "res.users", [["share", "=", true]]));
  return { totalPartners: total, customerRankedPartners: customers, portalUserCount: portalUsers };
}

async function auditHelpdesk(config: OdooConfig) {
  const teamFields = await safe(() => odooFieldsGet(config, "helpdesk.team"));
  const ticketFields = await safe(() => odooFieldsGet(config, "helpdesk.ticket"));
  const ticketFieldNames = "error" in ticketFields ? [] : Object.keys(ticketFields);
  const returnRelatedFields = ticketFieldNames.filter((f) => /return|refund|exchange|rma/i.test(f));
  return {
    teamModelExists: !("error" in teamFields),
    ticketModelExists: !("error" in ticketFields),
    returnRelatedTicketFields: returnRelatedFields,
  };
}

async function auditDeliveryTracking(config: OdooConfig) {
  const fields = await odooFieldsGet(config, "stock.picking");
  const names = Object.keys(fields);
  return {
    hasCarrierTrackingRef: names.includes("carrier_tracking_ref"),
    hasCarrierTrackingUrl: names.includes("carrier_tracking_url"),
    hasCarrierId: names.includes("carrier_id"),
    returnRelatedFields: names.filter((f) => /return|reverse/i.test(f)),
  };
}

async function auditInvoicing(config: OdooConfig) {
  const fields = await safe(() => odooFieldsGet(config, "account.move"));
  return { accountMoveExists: !("error" in fields) };
}

/** Customer-account/signup config is stored as ir.config_parameter system params in Odoo, not a
 * queryable field on a normal model — read the specific keys that control it. Keys/values here are
 * configuration, never secrets. */
async function auditWebsiteConfig(config: OdooConfig) {
  const keys = [
    "auth_signup.invitation_scope",
    "auth_signup.reset_password",
    "auth_signup.template_user_id",
  ];
  const rows = await odooSearchRead<{ key: string; value: string }>(
    config,
    "ir.config_parameter",
    [["key", "in", keys]],
    ["key", "value"],
    {}
  );
  const websites = await safe(() =>
    odooSearchRead<{ id: number; name: string; domain: string }>(config, "website", [], ["name", "domain"], { limit: 5 })
  );
  return { authSignupParams: rows, websites };
}

/** Odoo's native portal return flow is exposed via sale.order/stock.picking fields the portal
 * controller reads (e.g. a picking's return-eligibility), not a single boolean — report what's
 * present so the doc can state the real capability instead of guessing from the module list alone. */
async function auditReturnCapability(config: OdooConfig) {
  const pickingTypeFields = await odooFieldsGet(config, "stock.picking.type");
  const hasReturnPickingType = "return_type_id" in pickingTypeFields || "code" in pickingTypeFields;
  const stockMoveFields = await safe(() => odooFieldsGet(config, "stock.move"));
  const hasOriginReturnedMoveIds = !("error" in stockMoveFields) && "origin_returned_move_ids" in stockMoveFields;
  return { hasReturnPickingType, hasOriginReturnedMoveIds };
}

/** Phase I of the checkout/portal/returns spec: is calling Odoo's return WIZARD externally safe?
 * `stock.return.picking` is a TransientModel (a wizard, not a persistent business record) — its
 * normal UI flow is: open it with `context={'active_id': <picking_id>, 'active_model':
 * 'stock.picking'}`, let it auto-populate `product_return_moves` from that context, then call its
 * `create_returns()` button method. Calling `create` on a TransientModel via plain external
 * `execute_kw` does NOT run through the Odoo web client's context-injection — `active_id`/
 * `active_model` have to be supplied by the caller by hand, and `product_return_moves` (the
 * per-line quantities to return) would have to be pre-computed and supplied as one-to-many command
 * tuples, replicating logic that normally lives in the wizard's own Python `default_get`/
 * `_get_moves` methods (which are NOT part of the documented external API contract and are exactly
 * the kind of "hand-built stock moves without understanding reservation/warehouse implications"
 * the spec explicitly warns against, §39). This function only checks whether the model is
 * reachable at all via fields_get — it does NOT attempt to call `create_returns` or construct a
 * return, by design. */
async function auditReturnWizardSafety(config: OdooConfig) {
  const wizardFields = await safe(() => odooFieldsGet(config, "stock.return.picking"));
  const wizardLineFields = await safe(() => odooFieldsGet(config, "stock.return.picking.line"));
  return {
    wizardModelReachableViaFieldsGet: !("error" in wizardFields),
    wizardLineModelReachableViaFieldsGet: !("error" in wizardLineFields),
    hasCreateReturnsMethodEvidence: !("error" in wizardFields) && "product_return_moves" in wizardFields,
    conclusion:
      "fields_get succeeding only confirms the model exists on this instance, not that create_returns() is safely callable externally without replicating its wizard-context/default_get logic by hand — see the comment above this function.",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}
