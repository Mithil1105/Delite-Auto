import { supabase } from "../../lib/supabaseClient";

/** Structured error from the dealer/admin-dealers Edge Functions (or the demo backend). */
export class ApiError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export type DealerFunction = "admin-dealers" | "dealer-portal";

/** The single door every dealer/admin-dealers request goes through (Supabase Edge Functions). */
export async function callApi<T>(fn: DealerFunction, action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new ApiError("NOT_CONFIGURED", "The portal isn't connected to its backend yet.");
  const { data, error } = await supabase.functions.invoke(fn, { body: { action, payload } });
  if (error) {
    let parsed: { error?: { code?: string; message?: string; details?: unknown } } | null = null;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") parsed = await ctx.json().catch(() => null);
    throw new ApiError(parsed?.error?.code ?? "NETWORK", parsed?.error?.message ?? "Couldn't reach the server — check your connection and try again.", parsed?.error?.details);
  }
  return data as T;
}

