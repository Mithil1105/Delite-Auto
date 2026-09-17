import { odooFieldsGet, odooSearchRead } from "./client";

export interface ModelSchemaReport {
  model: string;
  exists: boolean;
  error?: string;
  /** field name -> { label, type, relation target if any } */
  fields?: Record<string, { string: string; type: string; relation?: string; required?: boolean }>;
  /** A few real records (id/name/display_name only — never the full record, to avoid leaking unrelated business data through a diagnostic endpoint). */
  sample?: Record<string, unknown>[];
}

/**
 * Introspects one Odoo model via `fields_get` (schema) + a tiny `search_read` (existence proof +
 * a name to eyeball). Used by `api/internal/odoo/schema.ts` to produce the actual field list this
 * store's instance has — the ONLY legitimate way to fill in
 * `Documentations MD/odoo-schema-report.md`'s "VERIFIED" column. Never guess a field exists;
 * `exists: false` here means the model genuinely isn't present on this instance (e.g.
 * `product.public.category` without the Website module installed), which is itself useful
 * information, not an error to paper over.
 */
export async function introspectModel(model: string, sampleFields: string[] = ["id", "name", "display_name"]): Promise<ModelSchemaReport> {
  try {
    const fields = (await odooFieldsGet(model, ["string", "type", "relation", "required"])) as ModelSchemaReport["fields"];
    let sample: Record<string, unknown>[] = [];
    try {
      sample = await odooSearchRead<Record<string, unknown>>(model, [], sampleFields, { limit: 3 });
    } catch {
      // A sample read failing (e.g. missing access rights on this particular model) doesn't
      // invalidate the fields_get result — the model's schema is still real information.
    }
    return { model, exists: true, fields, sample };
  } catch (err) {
    return { model, exists: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

const CANDIDATE_MODELS = [
  "product.template",
  "product.product",
  "product.category",
  "product.public.category",
  "product.attribute",
  "product.attribute.value",
  "product.template.attribute.line",
  "product.template.attribute.value",
] as const;

export interface OdooSchemaReport {
  models: ModelSchemaReport[];
}

/** Introspects every model relevant to the catalog integration in one call — see spec sections 5–7. */
export async function introspectOdooSchema(): Promise<OdooSchemaReport> {
  const models = await Promise.all(CANDIDATE_MODELS.map((m) => introspectModel(m)));
  return { models };
}
