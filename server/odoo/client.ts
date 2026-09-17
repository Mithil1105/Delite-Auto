/**
 * Server-only Odoo JSON-RPC client. NEVER import this from `src/` — it reads secrets from
 * `process.env` and only runs safely inside a server runtime (a Vercel function under `api/`,
 * or any other Node process), never in browser-shipped code.
 *
 * Talks to Odoo's documented external API (`common.login` for a uid, then `object.execute_kw`
 * for reads) over `/jsonrpc`. See `Documentations MD/odoo-live-catalog-integration.md` for the
 * connection model actually confirmed against this store's instance (or its current "not yet
 * verified" status if no live connection has been reachable yet).
 */

export class OdooNotConfiguredError extends Error {
  constructor() {
    super("Odoo is not configured — set ODOO_BASE_URL, ODOO_DATABASE, ODOO_USERNAME, ODOO_API_KEY.");
    this.name = "OdooNotConfiguredError";
  }
}

interface OdooConfig {
  baseUrl: string;
  database: string;
  username: string;
  apiKey: string;
}

function readConfig(): OdooConfig | null {
  const baseUrl = process.env.ODOO_BASE_URL;
  const database = process.env.ODOO_DATABASE;
  const username = process.env.ODOO_USERNAME;
  const apiKey = process.env.ODOO_API_KEY;
  if (!baseUrl || !database || !username || !apiKey) return null;
  return { baseUrl, database, username, apiKey };
}

export function isOdooConfigured(): boolean {
  return readConfig() !== null;
}

/** Which ODOO_* env vars are present — booleans only, never values. Safe for a diagnostic response. */
export function getConfigPresence(): { baseUrl: boolean; database: boolean; username: boolean; apiKey: boolean } {
  return {
    baseUrl: !!process.env.ODOO_BASE_URL,
    database: !!process.env.ODOO_DATABASE,
    username: !!process.env.ODOO_USERNAME,
    apiKey: !!process.env.ODOO_API_KEY,
  };
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
  if (json.error) throw new Error(`Odoo error: ${json.error.data?.message ?? json.error.message}`);
  if (json.result === undefined) throw new Error("Odoo returned no result");
  return json.result;
}

/**
 * Plain reachability probe — does the base URL respond at all, independent of authentication.
 * Used only by the health-check endpoint; not on the hot path of any product-serving request.
 */
export async function checkBaseUrlReachable(baseUrl: string, timeoutMs = 5000): Promise<{ reachable: boolean; status?: number; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/web/webclient/version_info`, {
      method: "GET",
      signal: controller.signal,
    });
    return { reachable: true, status: res.status };
  } catch (err) {
    return { reachable: false, error: err instanceof Error ? err.message : "Unknown network error" };
  } finally {
    clearTimeout(timeout);
  }
}

// Cached per warm serverless instance — avoids re-authenticating on every request. A cold start
// (or credential rotation) naturally clears this.
let cachedUid: number | null = null;

async function authenticate(config: OdooConfig): Promise<number> {
  if (cachedUid !== null) return cachedUid;
  const uid = await callJsonRpc<number | false>(config.baseUrl, "common", "login", [
    config.database,
    config.username,
    config.apiKey,
  ]);
  if (typeof uid !== "number") {
    throw new Error("Odoo authentication failed — check ODOO_USERNAME/ODOO_API_KEY/ODOO_DATABASE");
  }
  cachedUid = uid;
  return uid;
}

/**
 * Authenticates and returns the uid, without performing any further RPC — used by the
 * health-check endpoint to verify login succeeds independent of any model read. Throws
 * `OdooNotConfiguredError` if env vars are missing; otherwise whatever `authenticate()` throws
 * (a plain `Error` with a message safe to surface — it never includes the API key/password).
 */
export async function odooAuthenticate(): Promise<number> {
  const config = readConfig();
  if (!config) throw new OdooNotConfiguredError();
  return authenticate(config);
}

/**
 * Calls `object.execute_kw` — Odoo's generic model read/search/write RPC. Throws
 * `OdooNotConfiguredError` if credentials are missing so callers can fall back to mock data
 * (dev) or return a controlled error (prod) instead of leaking a raw exception.
 */
export async function odooExecuteKw<T>(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<T> {
  const config = readConfig();
  if (!config) throw new OdooNotConfiguredError();
  const uid = await authenticate(config);
  return callJsonRpc<T>(config.baseUrl, "object", "execute_kw", [
    config.database,
    uid,
    config.apiKey,
    model,
    method,
    args,
    kwargs,
  ]);
}

/** `search_read` convenience wrapper — the one method almost every catalog read needs. */
export function odooSearchRead<T>(
  model: string,
  domain: unknown[],
  fields: string[],
  opts: { offset?: number; limit?: number; order?: string } = {}
): Promise<T[]> {
  return odooExecuteKw<T[]>(model, "search_read", [domain, fields], {
    offset: opts.offset,
    limit: opts.limit,
    order: opts.order,
  });
}

/** `search_count` — for pagination totals without fetching every record. */
export function odooSearchCount(model: string, domain: unknown[]): Promise<number> {
  return odooExecuteKw<number>(model, "search_count", [domain]);
}

/** `fields_get` — schema introspection. Only used by `api/internal/odoo/schema.ts`. */
export function odooFieldsGet(model: string, attributes: string[] = ["string", "type", "relation", "required"]): Promise<Record<string, unknown>> {
  return odooExecuteKw<Record<string, unknown>>(model, "fields_get", [], { attributes });
}
