import { isSupabaseConfigured } from "../supabaseClient";

/**
 * Whether/how analytics runs in this browser. Three modes:
 *  - "off":  never sends anything (dev server, localhost, automated browsers, opted out, or no
 *            backend configured). This is what keeps localhost / Playwright / Vitest from ever
 *            polluting production numbers.
 *  - "live": production storefront traffic.
 *  - "test": explicitly enabled via `localStorage["delite-analytics-debug"] = "1"` (used by the
 *            Playwright tracking test and for manual verification). The server stores these
 *            sessions with is_test = true, so reports exclude them unless "include test traffic"
 *            is switched on.
 *
 * Consent readiness: `analyticsAllowed()` is the single gate every send passes through. Today it
 * honours an explicit opt-out flag; when a cookie/consent banner exists it should call
 * `setAnalyticsOptOut()` from that choice — no other code has to change. Only first-party,
 * non-fingerprinting identifiers are used (see Documentations MD/delite-analytics.md, "Privacy").
 */
export type AnalyticsMode = "off" | "live" | "test";

const OPT_OUT_KEY = "delite-analytics-optout";
const DEBUG_KEY = "delite-analytics-debug";

function flag(key: string): boolean {
  try { return localStorage.getItem(key) === "1"; } catch { return false; }
}

export function analyticsMode(): AnalyticsMode {
  if (typeof window === "undefined" || !isSupabaseConfigured) return "off";
  if (flag(OPT_OUT_KEY)) return "off";
  if (flag(DEBUG_KEY)) return "test";
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local");
  const automated = typeof navigator !== "undefined" && navigator.webdriver === true;
  if (!import.meta.env.PROD || local || automated) return "off";
  return "live";
}

export function setAnalyticsOptOut(optOut: boolean): void {
  try {
    if (optOut) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch { /* storage unavailable */ }
}
