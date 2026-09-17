// supabase/functions/odoo-health/index.ts
//
// Odoo connectivity check with TWO independent authentication diagnostics:
//   1. legacyRpcAuthenticated — the original external JSON-RPC `common.login` call
//      (database + username + api_key as password). Kept as-is, not removed.
//   2. json2Authenticated — Odoo 19's native JSON-2 API, authenticated via
//      `Authorization: Bearer <ODOO_API_KEY>` alone (no username/database in the auth step
//      itself). Added because Odoo API keys are documented as NOT usable for the classic web
//      login, and the two auth paths can behave differently — this isolates whether the API key
//      itself is valid independent of whatever's wrong (if anything) with the legacy path.
//
// The response NEVER includes the secret values themselves, and nothing here is logged — see
// Documentations MD/odoo-supabase-edge-functions.md.

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HealthResult {
  configured: boolean;
  reachable: boolean;
  legacyRpcAuthenticated: boolean;
  error?: string;
  odooServerVersion?: string;
  json2Authenticated?: boolean;
  json2HttpStatus?: number;
  json2Error?: string;
  /** true = only succeeded once X-Odoo-Database was added; false = succeeded without it;
   * undefined = neither variant succeeded (inconclusive). */
  json2DatabaseHeaderRequired?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  const baseUrl = Deno.env.get("ODOO_BASE_URL");
  const database = Deno.env.get("ODOO_DATABASE");
  const username = Deno.env.get("ODOO_USERNAME");
  const apiKey = Deno.env.get("ODOO_API_KEY");

  const result: HealthResult = {
    configured: !!(baseUrl && database && username && apiKey),
    reachable: false,
    legacyRpcAuthenticated: false,
  };

  if (!result.configured) {
    return json(result);
  }

  // baseUrl/database/username/apiKey are all non-null past this point (result.configured is
  // true).

  // ---- Diagnostic 1: legacy external JSON-RPC common.login (unchanged, kept alongside) ----
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const loginRes = await fetch(`${baseUrl}/jsonrpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: { service: "common", method: "login", args: [database, username, apiKey] },
        id: Date.now(),
      }),
    });
    clearTimeout(timeout);
    const loginJson = await loginRes.json();
    result.reachable = true;
    const uid = loginJson?.result;
    result.legacyRpcAuthenticated = typeof uid === "number" && uid > 0;
    if (!result.legacyRpcAuthenticated) {
      // Odoo's error.data.name/message are the SERVER's own diagnostic text about why the call
      // failed (e.g. an exception class name, "database does not exist", "Access Denied") — never
      // the credential values themselves, which Odoo has no reason to and does not echo back.
      // Truncated defensively in case of an unexpectedly large debug payload.
      const odooErr = loginJson?.error;
      const name = typeof odooErr?.data?.name === "string" ? odooErr.data.name : undefined;
      const message = typeof odooErr?.data?.message === "string" ? odooErr.data.message : odooErr?.message;
      const detail = [name, message].filter(Boolean).join(": ").slice(0, 200);
      result.error = detail ? `authentication_failed (${detail})` : "authentication_failed (no uid returned)";
    }
  } catch {
    result.error = "unreachable (request failed or timed out)";
  }

  // Unauthenticated diagnostic — server version, no credentials required.
  if (result.reachable && !result.legacyRpcAuthenticated) {
    try {
      const versionRes = await fetch(`${baseUrl}/jsonrpc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: { service: "common", method: "version", args: [] },
          id: Date.now(),
        }),
      });
      const versionJson = await versionRes.json();
      const serverVersion = versionJson?.result?.server_version;
      if (typeof serverVersion === "string") result.odooServerVersion = serverVersion;
    } catch {
      /* best-effort diagnostic only */
    }
  }

  // ---- Diagnostic 2: Odoo 19 native JSON-2 API, Bearer-token auth (independent of diagnostic 1) ----
  const withoutDbHeader = await tryJson2SearchCount(baseUrl, apiKey);
  if (withoutDbHeader.ok) {
    result.json2Authenticated = true;
    result.json2HttpStatus = withoutDbHeader.status;
    result.json2DatabaseHeaderRequired = false;
  } else {
    // Failure could plausibly be database-routing related — retry once, this time WITH
    // X-Odoo-Database, per the requested routing test. Not guessing an alternative database name,
    // just adding the header this instance may require.
    const withDbHeader = await tryJson2SearchCount(baseUrl, apiKey, database);
    if (withDbHeader.ok) {
      result.json2Authenticated = true;
      result.json2HttpStatus = withDbHeader.status;
      result.json2DatabaseHeaderRequired = true;
    } else {
      result.json2Authenticated = false;
      result.json2HttpStatus = withDbHeader.status || withoutDbHeader.status;
      result.json2Error = withDbHeader.errorMessage ?? withoutDbHeader.errorMessage;
      // Neither variant worked — inconclusive whether the header would help, leave undefined.
    }
  }

  return json(result);
});

/**
 * Odoo 19's native JSON-2 API — Bearer-token auth, no database/username in the auth step itself.
 * `search_count` on `res.partner` with an empty domain is the smallest possible authenticated,
 * read-only call: it proves the key is accepted without touching/returning any actual record
 * data (the count itself is never returned to the caller — see the "Do NOT return the
 * search_count result" instruction).
 */
async function tryJson2SearchCount(
  baseUrl: string,
  apiKey: string,
  database?: string
): Promise<{ status: number; ok: boolean; errorMessage?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  if (database) headers["X-Odoo-Database"] = database;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}/json/2/res.partner/search_count`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({ domain: [] }),
    });
    clearTimeout(timeout);

    let errorMessage: string | undefined;
    if (!res.ok) {
      try {
        const body = await res.json();
        const msg = body?.error?.message ?? body?.message ?? (typeof body?.error === "string" ? body.error : undefined);
        if (typeof msg === "string") errorMessage = msg.slice(0, 200);
      } catch {
        /* non-JSON or empty error body — HTTP status alone still reported */
      }
    }
    return { status: res.status, ok: res.ok, errorMessage };
  } catch {
    clearTimeout(timeout);
    return { status: 0, ok: false, errorMessage: "request_failed_or_timed_out" };
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
