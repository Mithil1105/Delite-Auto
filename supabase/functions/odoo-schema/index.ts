// supabase/functions/odoo-schema/index.ts
//
// Read-only live Odoo schema introspection. Protected — requires a matching x-internal-token
// header (INTERNAL_DIAGNOSTICS_TOKEN secret), fails closed if that secret isn't set at all. Only
// calls fields_get / search_read / search_count — never create/write/unlink. Never returns
// secret values, image binary payloads, or customer/order record data (res.partner, sale.order,
// sale.order.line are existence + field-metadata only, deliberately never sampled).
//
// See Documentations MD/odoo-schema-report.md for how this feeds the schema report, and
// Documentations MD/odoo-supabase-edge-functions.md for the broader architecture.

import { getOdooConfig, odooExecuteKw, odooFieldsGet, odooSearchRead, type OdooConfig, type OdooFieldMeta } from "../_shared/odoo/client.ts";

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
  "product.pricelist.item": ["pricelist_id", "product_tmpl_id", "product_id", "applied_on", "compute_price", "fixed_price", "price_discount"],
  "product.tag": ["name"],
  "product.template.tag": ["name"],
  "res.partner": ["name", "is_company", "supplier_rank", "customer_rank", "category_id"],
  "sale.order": ["name", "partner_id", "amount_total", "state"],
  "sale.order.line": ["order_id", "product_id", "price_unit", "qty_delivered"],
  "stock.quant": ["product_id", "quantity", "reserved_quantity", "location_id"],
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

    return json({
      configured: true,
      models: {
        "product.template": productSchema.template,
        "product.product": productSchema.variant,
        ...otherModels,
      },
    });
  } catch (err) {
    return json({ configured: true, error: err instanceof Error ? err.message : "Schema introspection failed" }, 500);
  }
});

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
