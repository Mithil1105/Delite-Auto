/**
 * Server-only Odoo JSON-RPC client. NEVER import this from `src/` — it reads secrets from
 * `process.env` and only runs safely inside a server runtime (a Vercel function under `api/`,
 * or any other Node process), never in browser-shipped code.
 *
 * This is scaffolding: it has never been run against a real Odoo instance in this session (no
 * ODOO_* credentials were available). The request shape follows Odoo's documented external API
 * (`common.login` for a uid, then `object.execute_kw` for reads/writes) but has not been
 * exercised end-to-end — verify it against the real instance before relying on it.
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

interface JsonRpcResponse<T> {
  result?: T;
  error?: { message: string; data?: { message?: string } };
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
 * Calls `object.execute_kw` — Odoo's generic model read/search/write RPC. Throws
 * `OdooNotConfiguredError` if credentials are missing so callers can fall back to mock data
 * instead of 500ing.
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
