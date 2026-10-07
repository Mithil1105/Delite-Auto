// supabase/functions/_shared/policy/config.ts
//
// Single source of truth (server side) for the return/exchange policy window and version — spec
// #32-33: "Do not scatter 7 through components... support future client update without rewriting
// return logic everywhere." Mirrored at src/lib/policy.ts for the frontend (a Deno Edge Function
// and the Vite frontend are separate build/deploy targets with no shared module path in this
// project — keep both files' values in sync by hand; each cross-references the other here).
//
// TEMPORARY BASELINE — CLIENT POLICY REVIEW REQUIRED (spec #32). Mirrors the prior Hasto project's
// default policy until Delite's own client confirms their final terms.

export const RETURNS_WINDOW_DAYS = 7;
export const POLICY_VERSION = "delite-temp-2026-09-v1";
