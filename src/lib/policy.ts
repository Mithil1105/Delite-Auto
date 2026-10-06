// src/lib/policy.ts
//
// Single source of truth (frontend side) for the return/exchange policy window and version — spec
// #32-33: "Do not scatter 7 through components... support future client update without rewriting
// return logic everywhere." Mirrored at supabase/functions/_shared/policy/config.ts for the
// server side (the actual eligibility ENFORCEMENT lives there — this file is display/UX
// convenience only, e.g. "7-day returns" copy at checkout; never trust a frontend eligibility
// check as authoritative, see spec #42).
//
// TEMPORARY BASELINE — CLIENT POLICY REVIEW REQUIRED (spec #32). Mirrors the prior Hasto project's
// default policy until Delite's own client confirms their final terms.

export const RETURNS_WINDOW_DAYS = 7;
export const POLICY_VERSION = "delite-temp-2026-09-v1";

export const POLICY_LINKS = {
  terms: "/terms",
  returns: "/policies/returns",
  refund: "/refund-policy",
  shipping: "/policies/shipping",
  privacy: "/policies/privacy",
} as const;
