// supabase/functions/_shared/dealer/pricing.ts
//
// Pure dealer price rules: effective-price resolution, window overlap detection, input validation
// and the publish planner. Everything money-related is INTEGER PAISE. The planner's output is what
// the SQL function `dealer_apply_price_plan` (and the in-memory repo) applies atomically.

import { DealerError } from "./errors.ts";
import type { AccessRow, PriceRuleRow, TaxBasis } from "./types.ts";

export const MAX_PRICE_PAISE = 100_000_000_00; // ₹10 crore per unit — a sanity ceiling, not a business rule.

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

export function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ts(value: string | null, fallback: number): number {
  return value ? Date.parse(value) : fallback;
}

/** Half-open [start, end) windows, matching Postgres tstzrange's default bounds. */
export function windowsOverlap(a: Pick<PriceRuleRow, "starts_at" | "ends_at">, b: Pick<PriceRuleRow, "starts_at" | "ends_at">): boolean {
  const aStart = ts(a.starts_at, -Infinity);
  const aEnd = ts(a.ends_at, Infinity);
  const bStart = ts(b.starts_at, -Infinity);
  const bEnd = ts(b.ends_at, Infinity);
  return aStart < bEnd && bStart < aEnd;
}

/** The ACTIVE rule in force for one variant at `now`, or null. Precedence v1 (spec §7): an explicit
 * active dealer+variant fixed price, otherwise "not purchasable" — there is NO public-price
 * fallback, by design. Overlaps are prevented upstream, so at most one rule can match. */
export function resolveActiveRule(rules: PriceRuleRow[], variantId: number, now: Date): PriceRuleRow | null {
  const t = now.getTime();
  for (const rule of rules) {
    if (rule.status !== "active" || rule.odoo_variant_id !== variantId) continue;
    if (ts(rule.starts_at, -Infinity) <= t && t < ts(rule.ends_at, Infinity)) return rule;
  }
  return null;
}

export interface PriceInput {
  pricePaise: number;
  taxBasis: TaxBasis;
  startsAt?: string | null;
  endsAt?: string | null;
  note?: string | null;
}

export function validatePriceInput(input: PriceInput): void {
  if (!Number.isInteger(input.pricePaise) || input.pricePaise <= 0) {
    throw new DealerError("VALIDATION", "Price must be a positive amount");
  }
  if (input.pricePaise > MAX_PRICE_PAISE) throw new DealerError("VALIDATION", "Price is unrealistically large — check the amount");
  if (input.taxBasis !== "exclusive" && input.taxBasis !== "inclusive") throw new DealerError("VALIDATION", "Tax basis must be exclusive or inclusive");
  for (const [label, value] of [["Start", input.startsAt], ["End", input.endsAt]] as const) {
    if (value && Number.isNaN(Date.parse(value))) throw new DealerError("VALIDATION", `${label} date is not a valid date`);
  }
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new DealerError("VALIDATION", "End date must be after the start date");
  }
  if (input.note && input.note.length > 500) throw new DealerError("VALIDATION", "Deal note is limited to 500 characters");
}

export interface PublishPlan {
  /** Instant "effective immediately" drafts become active from. */
  at: string;
  expireIds: string[];
  activate: { id: string; startsAt: string | null; endsAt: string | null }[];
}

/**
 * Decides what publishing the given drafts does, without touching any data:
 *  - a draft with NO explicit start ("effective now") replaces whatever active rule currently
 *    overlaps it: that rule is expired as of `now` and the draft starts at `now`;
 *  - a draft WITH an explicit window (a scheduled deal) must not overlap any active rule that stays
 *    in force — the overlap is rejected as a conflict (spec §7: reject, don't guess priority);
 *  - two drafts for the same variant that overlap each other are also a conflict.
 */
export function planPublish(drafts: PriceRuleRow[], actives: PriceRuleRow[], now: Date): PublishPlan {
  const at = now.toISOString();
  const expire = new Set<string>();
  const activate: PublishPlan["activate"] = [];
  const planned: PriceRuleRow[] = [];

  for (const draft of drafts) {
    // "Effective now" = no start, or a start that is already in the past (the admin grid pre-fills the
    // live price's own start date, so a plain price edit arrives with a past start). Either way it
    // replaces the price currently in force instead of conflicting with it.
    const immediate = !draft.starts_at || Date.parse(draft.starts_at) <= now.getTime();
    const startsAt = immediate ? at : draft.starts_at;
    const candidate: PriceRuleRow = { ...draft, starts_at: startsAt };

    if (candidate.ends_at && Date.parse(candidate.ends_at) <= now.getTime()) {
      throw new DealerError("CONFLICT", "A deal that has already ended cannot be published", { variantId: draft.odoo_variant_id });
    }

    for (const active of actives) {
      if (active.odoo_variant_id !== draft.odoo_variant_id || expire.has(active.id)) continue;
      if (!windowsOverlap(candidate, active)) continue;
      if (immediate) expire.add(active.id);
      else throw new DealerError("CONFLICT", "This scheduled deal overlaps the price currently in force — end the current price first", { variantId: draft.odoo_variant_id });
    }
    for (const other of planned) {
      if (other.odoo_variant_id === candidate.odoo_variant_id && windowsOverlap(candidate, other)) {
        throw new DealerError("CONFLICT", "Two draft prices for the same product overlap", { variantId: draft.odoo_variant_id });
      }
    }
    planned.push(candidate);
    activate.push({ id: draft.id, startsAt, endsAt: draft.ends_at });
  }
  return { at, expireIds: [...expire], activate };
}

export function adjustPaiseByPercent(paise: number, percent: number): number {
  if (!Number.isFinite(percent) || percent <= -100 || percent > 1000) throw new DealerError("VALIDATION", "Percentage must be between -99.99 and 1000");
  return Math.max(1, Math.round(paise * (1 + percent / 100)));
}

export interface ReadinessIssue {
  code: "no_products" | "missing_price" | "no_owner_email" | "no_gstin_hint";
  message: string;
  variantIds?: number[];
}

/** "Ready to activate" check (spec §13 / open decision: every visible+orderable assigned product
 * must have a valid, currently-effective price before a dealer can be invited). */
export function checkReadiness(args: { ownerEmail: string | null; access: AccessRow[]; rules: PriceRuleRow[]; now: Date }): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  if (!args.ownerEmail) issues.push({ code: "no_owner_email", message: "Owner email is required to send an invite" });
  const sellable = args.access.filter((a) => a.is_visible);
  if (sellable.length === 0) issues.push({ code: "no_products", message: "Assign at least one product" });
  const missing = sellable.filter((a) => a.is_orderable && !resolveActiveRule(args.rules, a.odoo_variant_id, args.now)).map((a) => a.odoo_variant_id);
  if (missing.length > 0) {
    issues.push({ code: "missing_price", message: `${missing.length} assigned product${missing.length === 1 ? " has" : "s have"} no published price`, variantIds: missing });
  }
  return issues;
}
