// supabase/functions/_shared/odoo/client.ts
//
// Deno-native Odoo JSON-RPC client (common.login + object.execute_kw over /jsonrpc) — the base
// every catalog/diagnostic Edge Function builds on. Reads Deno.env.get, never process.env. This
// is the canonical shared client; supabase/functions/_shared/odoo.ts (the earlier flat version)
// has been retired in favor of this nested module — see Documentations MD/odoo-real-catalog.md.
//
// NEVER import this from client-shipped code. NEVER log a config value or return one in a
// response — every function here returns/throws only field metadata, record data, or Odoo's own
// (non-credential) error text.

export interface OdooConfig {
  baseUrl: string;
  database: string;
  username: string;
  apiKey: string;
}

export function getOdooConfig(): OdooConfig | null {
  const baseUrl = Deno.env.get("ODOO_BASE_URL");
  const database = Deno.env.get("ODOO_DATABASE");
  const username = Deno.env.get("ODOO_USERNAME");
  const apiKey = Deno.env.get("ODOO_API_KEY");
  if (!baseUrl || !database || !username || !apiKey) return null;
  return { baseUrl, database, username, apiKey };
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { message: string; data?: { message?: string; name?: string } };
}

async function callJsonRpc<T>(baseUrl: string, service: string, method: string, args: unknown[]): Promise<T> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: Date.now() }),
  });
  if (!res.ok) throw new Error(`Odoo request failed: HTTP ${res.status}`);
  const json = (await res.json()) as JsonRpcResponse<T>;
  if (json.error) {
    const detail = [json.error.data?.name, json.error.data?.message ?? json.error.message].filter(Boolean).join(": ");
    throw new Error(detail || "Odoo RPC error");
  }
  if (json.result === undefined) throw new Error("Odoo returned no result");
  return json.result;
}

// Cached per warm isolate — a cold start (new isolate) clears this naturally; a credential
// rotation on an already-warm isolate would not be picked up until it recycles. Acceptable
// tradeoff, same one server/odoo/client.ts makes for the Vercel runtime.
let cachedUid: number | null = null;

export async function odooAuthenticate(config: OdooConfig): Promise<number> {
  if (cachedUid !== null) return cachedUid;
  const uid = await callJsonRpc<number | false>(config.baseUrl, "common", "login", [config.database, config.username, config.apiKey]);
  if (typeof uid !== "number") throw new Error("Odoo authentication failed");
  cachedUid = uid;
  return uid;
}

export async function odooExecuteKw<T>(
  config: OdooConfig,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  const uid = await odooAuthenticate(config);
  return callJsonRpc<T>(config.baseUrl, "object", "execute_kw", [config.database, uid, config.apiKey, model, method, args, kwargs]);
}

export interface OdooFieldMeta {
  string: string;
  type: string;
  relation?: string;
  required?: boolean;
  readonly?: boolean;
  selection?: [string, string][];
}

export function odooFieldsGet(config: OdooConfig, model: string): Promise<Record<string, OdooFieldMeta>> {
  return odooExecuteKw(config, model, "fields_get", [], { attributes: ["string", "type", "relation", "required", "readonly", "selection"] });
}

export function odooSearchRead<T>(
  config: OdooConfig,
  model: string,
  domain: unknown[],
  fields: string[],
  opts: { offset?: number; limit?: number; order?: string } = {}
): Promise<T[]> {
  return odooExecuteKw<T[]>(config, model, "search_read", [domain, fields], opts);
}

export function odooSearchCount(config: OdooConfig, model: string, domain: unknown[]): Promise<number> {
  return odooExecuteKw<number>(config, model, "search_count", [domain]);
}

export function odooRead<T>(config: OdooConfig, model: string, ids: number[], fields: string[]): Promise<T[]> {
  return odooExecuteKw<T[]>(config, model, "read", [ids, fields]);
}
