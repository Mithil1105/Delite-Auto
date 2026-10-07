// supabase/functions/odoo-schema/index.ts
//
// Read-only live Odoo schema introspection. Protected — requires a matching x-internal-token
// header (INTERNAL_DIAGNOSTICS_TOKEN secret), fails closed if that secret isn't set at all. Only
// calls fields_get / search_read / search_count — never create/write/unlink. Never returns
// secret values, image binary payloads, or customer/order record data (res.partner, sale.order,
// sale.order.line are existence + field-metadata only, deliberately never sampled).
//
// One deliberate exception (added for Phase 4B's native-pricing-method discovery, see
// probePricingMethod below): a single `onchange` RPC call on sale.order.line. `onchange` is a
// core, non-private ORM method that NEVER persists anything — it's the same mechanism Odoo's own
// web client uses for every live form computation — so it carries the same read-only guarantee
// as fields_get/search_read even though it isn't literally one of those three methods.
//
// See Documentations MD/odoo-schema-report.md for how this feeds the schema report, and
// Documentations MD/odoo-supabase-edge-functions.md for the broader architecture, and
// Documentations MD/odoo-checkout-finalization.md for the Phase 4 tax/fiscal-position/pricing audit.

import { getOdooConfig, odooExecuteKw, odooFieldsGet, odooSearchCount, odooSearchRead, type OdooConfig, type OdooFieldMeta } from "../_shared/odoo/client.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token",
};

// Never request these as VALUES in any search_read — binary image payloads. Existence is checked
// via fields_get (metadata only) instead.
const IMAGE_FIELD_NAMES = new Set(["image_1920", "image_1024", "image_512", "image_256", "image_128", "image", "image_128_url"]);

interface ModelIntrospection {
  exists: boolean;
  /** Only whether these binary/image fields exist on the model — never their values. */
  fields: Record<string, { label: string; type: string; relation?: string; required?: boolean; selection?: [string, string][] }>;
  sample?: Record<string, unknown>[];
  error?: string;
  /** Debug-only fields, present only when the primary sample came back unexpectedly empty. */
  diagnosticMinimalSample?: Record<string, unknown>[];
  diagnosticSearchCount?: number;
}

/** Curated "fields of interest" per model — keeps the response from dumping every field Odoo
 * has (res.partner/sale.order alone have 100+). product.template/product.product are handled
 * separately below since their custom fields must be discovered dynamically, not curated. */
const FIELDS_OF_INTEREST: Record<string, string[]> = {
  "product.category": ["name", "complete_name", "parent_id", "product_count", "sequence"],
  "product.public.category": ["name", "parent_id", "sequence", "website_id"],
  "product.attribute": ["name", "display_type", "create_variant"],
  "product.attribute.value": ["name", "attribute_id", "sequence"],
  "product.template.attribute.line": ["product_tmpl_id", "attribute_id", "value_ids"],
  "product.template.attribute.value": ["product_tmpl_id", "attribute_id", "product_attribute_value_id", "price_extra", "name"],
  "product.image": ["name", "sequence", "product_tmpl_id", "product_variant_id"],
  "product.pricelist": ["name", "currency_id"],
  "product.pricelist.item": [
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
  "product.tag": ["name"],
  "product.template.tag": ["name"],
  "res.partner": ["name", "is_company", "supplier_rank", "customer_rank", "category_id", "property_product_pricelist", "property_account_position_id"],
  "sale.order": ["name", "partner_id", "amount_total", "state", "pricelist_id", "fiscal_position_id", "amount_untaxed", "amount_tax", "currency_id", "partner_shipping_id", "partner_invoice_id"],
  "sale.order.line": ["order_id", "product_id", "price_unit", "qty_delivered", "tax_id", "discount", "price_subtotal", "price_tax", "price_total", "product_uom_qty"],
  "stock.quant": ["product_id", "quantity", "reserved_quantity", "location_id"],
  // --- Added for Phase 4 tax/delivery/fiscal-position audit (odoo-checkout-finalization.md) ---
  "account.tax": ["name", "amount", "amount_type", "type_tax_use", "price_include", "include_base_amount", "country_id", "active", "company_id"],
  "account.fiscal.position": ["name", "auto_apply", "country_id", "country_group_id", "state_ids", "zip_from", "zip_to", "active", "tax_ids"],
  "account.fiscal.position.tax": ["position_id", "tax_src_id", "tax_dest_id"],
  "res.country": ["name", "code"],
  "res.country.state": ["name", "code", "country_id"],
  "delivery.carrier": ["name", "delivery_type", "fixed_price", "free_over", "product_id", "active", "website_published", "integration_level", "company_id"],
  // --- Added for Phase 1/6 native-checkout domain/handoff audit (odoo-native-checkout.md) ---
  "website": ["name", "domain", "company_id", "default_lang_id", "theme_id"],
};

/** Models never sampled even if they exist — customer/order data, per explicit instruction not
 * to return it. Field metadata (fields_get) is still reported — that's schema, not data. */
const NEVER_SAMPLE = new Set(["res.partner", "sale.order", "sale.order.line"]);

const SAMPLE_LIMITS: Record<string, number> = {
  "stock.quant": 5,
  "product.public.category": 40,
  "product.category": 40,
  "product.attribute.value": 40,
  "product.template.attribute.value": 25,
  "product.template.attribute.line": 25,
  "product.tag": 10,
  "product.pricelist.item": 10,
  "account.tax": 30,
  "account.fiscal.position": 20,
  "account.fiscal.position.tax": 20,
  "res.country": 3, // shape-check only — targeted lookup below answers the real question
  "res.country.state": 3, // shape-check only — targeted lookup below answers the real question
  "delivery.carrier": 10,
};
const DEFAULT_SAMPLE_LIMIT = 3;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const requiredToken = Deno.env.get("INTERNAL_DIAGNOSTICS_TOKEN");
  if (!requiredToken) {
    return json({ error: "Diagnostics disabled: INTERNAL_DIAGNOSTICS_TOKEN is not set" }, 403);
  }
  const providedToken = req.headers.get("x-internal-token");
  if (providedToken !== requiredToken) {
    return json({ error: "Missing or invalid x-internal-token header" }, 403);
  }

  const config = getOdooConfig();
  if (!config) {
    return json({ configured: false });
  }

  try {
    // Sequential, not Promise.all — the first version fired ~30 concurrent RPC calls (fields_get
    // + search_read across 17 models) and Odoo rate-limited most of them (HTTP 429), even
    // silently starving product.template's own sample. This is a one-off diagnostic call, not a
    // hot path — there's no reason to race the instance's rate limiter for speed.
    const productSchema = await introspectProductModels(config);
    await sleep(350);
    const otherModels = await introspectOtherModels(config);
    await sleep(350);
    const addressResolutionProbe = await probeAddressResolution(config);
    await sleep(350);
    const pricingMethodProbe = await probePricingMethod(config);
    await sleep(350);
    const embedCodeCapabilityProbe = await probeEmbedCodeCapability(config);

    return json({
      configured: true,
      models: {
        "product.template": productSchema.template,
        "product.product": productSchema.variant,
        ...otherModels,
      },
      addressResolutionProbe,
      pricingMethodProbe,
      embedCodeCapabilityProbe,
    });
  } catch (err) {
    return json({ configured: true, error: err instanceof Error ? err.message : "Schema introspection failed" }, 500);
  }
});

/**
 * Targeted (not blind-sampled) res.country/res.country.state lookup — proves whether the exact
 * resolution path the Phase 6 address fix needs (country code "IN" -> a handful of real Indian
 * states this store actually ships to) is safe and unambiguous, rather than just confirming the
 * models/fields exist. search_read only — read-only.
 */
async function probeAddressResolution(config: OdooConfig): Promise<Record<string, unknown>> {
  try {
    const countries = await odooSearchRead<{ id: number; name: string; code: string }>(
      config,
      "res.country",
      [["code", "=", "IN"]],
      ["id", "name", "code"],
      { limit: 1 }
    );
    const india = countries[0];
    if (!india) return { indiaFound: false };

    await sleep(300);
    const probeNames = ["Gujarat", "Maharashtra"];
    const stateMatches: Record<string, unknown[]> = {};
    for (const name of probeNames) {
      const matches = await odooSearchRead<{ id: number; name: string; code: string }>(
        config,
        "res.country.state",
        [
          ["country_id", "=", india.id],
          ["name", "ilike", name],
        ],
        ["id", "name", "code"],
        { limit: 5 }
      );
      stateMatches[name] = matches;
      await sleep(300);
    }

    return { indiaFound: true, india, stateMatches };
  } catch (err) {
    return { error: err instanceof Error ? err.message.slice(0, 200) : "address resolution probe failed" };
  }
}

/**
 * Phase 4B: does this Odoo instance expose a safe, non-mutating, externally-callable method that
 * computes the SAME price_unit/tax_id Odoo's own Sales app would use for a real product+qty,
 * instead of us re-implementing the pricelist engine?
 *
 * `onchange` is a core, non-private ORM method (no leading underscore, so NOT blocked by Odoo's
 * external-API private-method guard) — it is literally the same RPC call the Odoo web client
 * itself makes for every form field edit. Calling it NEVER persists anything to the database; it
 * only returns a computed `value` diff for the requested field. This is the one addition to this
 * file that isn't fields_get/search_read/search_count, but it carries the same safety guarantee
 * (no create/write/unlink) the rest of this diagnostic promises — see file header.
 *
 * Tested against a real, already-known product (ACTIVA SET OF 3, product.product id 10, which
 * Phase 2 already found has a pricelist fixed_price of 1500 equal to its list_price) so the
 * result is independently checkable against known-good evidence, not just "did it not error".
 */
async function probePricingMethod(config: OdooConfig): Promise<Record<string, unknown>> {
  const KNOWN_VARIANT_ID = 10; // ACTIVA SET OF 3 — real id confirmed in Phase 2 live audit
  try {
    const result = await odooExecuteKw<{ value?: Record<string, unknown>; warning?: unknown }>(
      config,
      "sale.order.line",
      "onchange",
      [
        [],
        { order_id: false, product_id: KNOWN_VARIANT_ID, product_uom_qty: 1, price_unit: 0 },
        "product_id",
        { product_id: "1", product_uom_qty: "1", price_unit: "1", tax_id: "1", product_uom: "1" },
      ],
      {}
    );
    return {
      attempted: true,
      callable: true,
      knownVariantId: KNOWN_VARIANT_ID,
      returnedValue: result?.value ?? null,
      hasWarning: !!result?.warning,
    };
  } catch (err) {
    return {
      attempted: true,
      callable: false,
      knownVariantId: KNOWN_VARIANT_ID,
      error: err instanceof Error ? err.message.slice(0, 300) : "onchange probe failed",
    };
  }
}

/**
 * Phase 6A (odoo-native-checkout.md): without interactive Website Editor access, this is the one
 * read-only way to get real evidence on whether this Odoo instance's website views already
 * contain embedded <script> content (proving the "Embed Code" mechanism is live/renderable here,
 * not just theoretically available in some Odoo editions). Only searches for the SUBSTRING
 * "<script" inside ir.ui.view.arch_db (website page/template content) and returns id/name/key —
 * never the full page markup, never customer data. search_count + a small search_read only.
 */
async function probeEmbedCodeCapability(config: OdooConfig): Promise<Record<string, unknown>> {
  try {
    const domain = [
      ["type", "=", "qweb"],
      ["arch_db", "ilike", "<script"],
    ];
    const count = await odooSearchCount(config, "ir.ui.view", domain);
    await sleep(300);
    const sample = await odooSearchRead<{ id: number; name: string; key: string }>(config, "ir.ui.view", domain, ["id", "name", "key"], { limit: 15 });
    return { scriptEmbeddingViewCount: count, sample };
  } catch (err) {
    return { error: err instanceof Error ? err.message.slice(0, 200) : "embed code capability probe failed" };
  }
}

/**
 * product.template and product.product get special handling: their custom fields (names starting
 * with "x_", including the "x_studio_" Studio-generated prefix) must be discovered dynamically —
 * there's no fixed allowlist for a field name we don't know yet, that's the entire point of this
 * endpoint. Standard fields of interest are curated the same way as the other models; custom
 * fields are ALL x_-prefixed fields found by fields_get, no filtering.
 */
async function introspectProductModels(config: OdooConfig): Promise<{ template: ModelIntrospection; variant: ModelIntrospection }> {
  const STANDARD_TEMPLATE_OF_INTEREST = [
    "name",
    "default_code",
    "barcode",
    "list_price",
    "description_sale",
    "active",
    "sale_ok",
    "website_published",
    "is_published",
    "categ_id",
    "public_categ_ids",
    "qty_available",
    "virtual_available",
    "free_qty",
    "product_variant_ids",
    "product_variant_count",
    "attribute_line_ids",
    "write_date",
    "taxes_id",
  ];
  const STANDARD_VARIANT_OF_INTEREST = [
    "name",
    "default_code",
    "barcode",
    "list_price",
    "active",
    "qty_available",
    "virtual_available",
    "free_qty",
    "product_tmpl_id",
    "product_template_attribute_value_ids",
    "write_date",
    "taxes_id",
  ];

  const templateFieldsRaw = await odooFieldsGet(config, "product.template").catch(() => null);
  await sleep(350);
  const variantFieldsRaw = await odooFieldsGet(config, "product.product").catch(() => null);
  await sleep(350);

  if (!templateFieldsRaw) return { template: { exists: false, fields: {}, error: "fields_get failed" }, variant: introspectFailed(variantFieldsRaw) };

  const templateCustomFieldNames = Object.keys(templateFieldsRaw).filter((f) => f.startsWith("x_"));
  const variantCustomFieldNames = variantFieldsRaw ? Object.keys(variantFieldsRaw).filter((f) => f.startsWith("x_")) : [];

  const templateFieldsOfInterest = pickFields(templateFieldsRaw, [...STANDARD_TEMPLATE_OF_INTEREST, ...templateCustomFieldNames]);
  const templateImageFieldsPresent = Object.keys(templateFieldsRaw).filter((f) => IMAGE_FIELD_NAMES.has(f));

  // Broad, curated sample — every field CONFIRMED present by fields_get above (templateFieldsOfInterest
  // already filtered STANDARD_TEMPLATE_OF_INTEREST + custom fields down to real ones — e.g.
  // "free_qty" is on product.product but not product.template on this instance; requesting an
  // unconfirmed field name makes the whole search_read error out, which is exactly what happened
  // before this fix was applied). Image fields excluded regardless (existence-only, see above).
  const templateSampleFields = ["id", ...Object.keys(templateFieldsOfInterest)].filter((f) => !IMAGE_FIELD_NAMES.has(f));
  let templateSample: Record<string, unknown>[] = [];
  let templateSampleError: string | undefined;
  try {
    templateSample = await odooSearchRead(config, "product.template", [], templateSampleFields, { limit: 20, order: "id asc" });
  } catch (err) {
    // Reported, not swallowed — an empty sample with no error looks identical to "this store
    // genuinely has zero products," which would be a very different (and wrong) conclusion.
    templateSampleError = err instanceof Error ? err.message.slice(0, 200) : "unknown error";
  }

  // Diagnostic-only fallback: the full-field, ordered query above came back empty with no thrown
  // error while the near-identical product.product query (below) returned real records — that's
  // an anomaly, not an assumed "this store has zero templates." Try the smallest possible
  // request (2 fields, no order, no context assumptions) to isolate whether the field list or
  // the `order` clause is the actual cause, rather than guessing.
  let templateMinimalSample: Record<string, unknown>[] | undefined;
  let templateMinimalCount: number | undefined;
  if (templateSample.length === 0 && !templateSampleError) {
    try {
      templateMinimalSample = await odooSearchRead<Record<string, unknown>>(config, "product.template", [], ["id", "name"], { limit: 5 });
      await sleep(350);
      templateMinimalCount = await odooExecuteKw<number>(config, "product.template", "search_count", [[]]);
    } catch (err) {
      templateSampleError = `minimal fallback also failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`;
    }
  }

  const template: ModelIntrospection = {
    exists: true,
    fields: { ...templateFieldsOfInterest, ...describeImageFields(templateImageFieldsPresent) },
    sample: templateSample,
    ...(templateSampleError ? { error: `sample fetch failed: ${templateSampleError}` } : {}),
    ...(templateMinimalSample !== undefined ? { diagnosticMinimalSample: templateMinimalSample, diagnosticSearchCount: templateMinimalCount } : {}),
  };

  await sleep(350);

  let variant: ModelIntrospection;
  if (!variantFieldsRaw) {
    variant = { exists: false, fields: {}, error: "fields_get failed" };
  } else {
    const variantFieldsOfInterest = pickFields(variantFieldsRaw, [...STANDARD_VARIANT_OF_INTEREST, ...variantCustomFieldNames]);
    const variantImageFieldsPresent = Object.keys(variantFieldsRaw).filter((f) => IMAGE_FIELD_NAMES.has(f));
    // Same fix as the template sample above — only request fields fields_get actually confirmed.
    const variantSampleFields = ["id", ...Object.keys(variantFieldsOfInterest)].filter((f) => !IMAGE_FIELD_NAMES.has(f));
    let variantSample: Record<string, unknown>[] = [];
    let variantSampleError: string | undefined;
    try {
      // Prefer variants whose template has more than one variant — those are the real
      // multi-variant products this phase needs to inspect (see spec section 10).
      variantSample = await odooSearchRead(config, "product.product", [], variantSampleFields, { limit: 15, order: "product_tmpl_id asc" });
    } catch (err) {
      variantSampleError = err instanceof Error ? err.message.slice(0, 200) : "unknown error";
    }
    variant = {
      exists: true,
      fields: { ...variantFieldsOfInterest, ...describeImageFields(variantImageFieldsPresent) },
      sample: variantSample,
      ...(variantSampleError ? { error: `sample fetch failed: ${variantSampleError}` } : {}),
    };
  }

  return { template, variant };
}

function introspectFailed(_raw: unknown): ModelIntrospection {
  return { exists: false, fields: {}, error: "fields_get failed" };
}

function describeImageFields(names: string[]): Record<string, { label: string; type: string }> {
  const out: Record<string, { label: string; type: string }> = {};
  for (const name of names) out[name] = { label: "(binary image field — existence only, value never fetched)", type: "binary" };
  return out;
}

function pickFields(all: Record<string, OdooFieldMeta>, names: string[]): ModelIntrospection["fields"] {
  const out: ModelIntrospection["fields"] = {};
  for (const name of names) {
    const meta = all[name];
    if (!meta) continue; // field doesn't exist on this model — omitted, not reported as empty
    out[name] = { label: meta.string, type: meta.type, relation: meta.relation, required: meta.required, selection: meta.selection };
  }
  return out;
}

async function introspectOtherModels(config: OdooConfig): Promise<Record<string, ModelIntrospection>> {
  const modelNames = Object.keys(FIELDS_OF_INTEREST);
  const out: Record<string, ModelIntrospection> = {};
  for (const model of modelNames) {
    await sleep(350); // small safety margin against the rate limiting seen during testing
    try {
      const allFields = await odooFieldsGet(config, model);
      const fields = pickFields(allFields, FIELDS_OF_INTEREST[model]);
      let sample: Record<string, unknown>[] | undefined;
      if (!NEVER_SAMPLE.has(model)) {
        try {
          const sampleFields = ["id", ...FIELDS_OF_INTEREST[model].filter((f) => allFields[f])];
          sample = await odooSearchRead(config, model, [], sampleFields, { limit: SAMPLE_LIMITS[model] ?? DEFAULT_SAMPLE_LIMIT });
        } catch {
          /* sample failure doesn't invalidate the schema itself */
        }
      }
      out[model] = { exists: true, fields, sample };
    } catch (err) {
      out[model] = { exists: false, fields: {}, error: err instanceof Error ? err.message.slice(0, 200) : "unknown error" };
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
