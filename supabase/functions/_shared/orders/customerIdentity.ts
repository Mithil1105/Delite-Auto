// supabase/functions/_shared/orders/customerIdentity.ts
//
// Resolves a checkout's Odoo customer + delivery address identity — the one place every
// order-creation path (create-order COD, _shared/payments/finalize.ts online) derives
// partner_id/partner_invoice_id/partner_shipping_id, replacing the previous inline
// findOrCreatePartner(), which silently picked `limit: 1` on an ambiguous match and overwrote the
// customer's own address every order instead of modeling delivery addresses as real Odoo child
// contacts. See Documentations MD/odoo-checkout-portal-returns.md.
//
// SECURITY: the caller-supplied `supabaseUserId` is the ONLY customer identity ever trusted from a
// session — never a browser-sent Odoo partner id (spec #3). Everything else here is either
// re-derived server-side (the mapped partner id, via `profiles.odoo_partner_id`) or freshly
// resolved against live Odoo (email search) — this module never trusts a client-supplied
// odoo_partner_id at all; there is no parameter for one.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { odooCreate, odooExecuteKw, odooSearchRead, type OdooConfig } from "../odoo/client.ts";
import { resolveStructuredAddress, formatShippingAddress as formatShippingAddressImpl, type AddressInput, type StructuredOdooAddress } from "../address/resolveAddress.ts";

export type { AddressInput };

export interface ResolveCustomerParams {
  db: SupabaseClient;
  odooConfig: OdooConfig;
  /** Present for an authenticated checkout, absent for a guest one. */
  supabaseUserId?: string;
  name: string;
  email: string;
  phone: string;
  address: AddressInput;
}

export interface ResolvedCustomer {
  /** The customer's own (invoicing) partner id — also what gets saved to profiles.odoo_partner_id. */
  partnerId: number;
  /** The delivery child contact created/reused for this specific address — used as
   * sale.order.partner_shipping_id. Equal to partnerId when a distinct delivery contact couldn't
   * safely be resolved (never blocks checkout over this). */
  shippingPartnerId: number;
  /** True when server-side email search found more than one plausible match and had to fall back
   * to creating a new contact rather than guessing — surfaced so callers can log it; never blocks
   * checkout (spec #65: never expose candidates, never fail checkout over ambiguity — a fresh
   * contact is always a safe, honest fallback). */
  ambiguousMatch: boolean;
}

/** Normalizes for comparison only — never used to rewrite what's stored (spec #5: no alias
 * stripping, no domain rewriting). */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolves the Odoo customer for this checkout, in priority order:
 *   1. An authenticated customer's existing `profiles.odoo_partner_id` mapping (fast path, no
 *      Odoo search needed — this is the durable mapping spec #2 asks for).
 *   2. A live, exact (normalized) email search against `res.partner` — 0 matches -> create;
 *      exactly 1 -> reuse; 2+ -> never guess, create a new contact instead (spec #4/#65) and flag
 *      `ambiguousMatch` for logging/operational follow-up, rather than silently picking one or
 *      blocking the checkout.
 * Then resolves a delivery child contact (type='delivery', parent_id=partnerId) for the submitted
 * address — reuses an existing child with an identical street/street2 when one exists, so repeat
 * orders to the same address don't create a new child contact every time.
 */
export async function resolveCustomer(params: ResolveCustomerParams): Promise<ResolvedCustomer> {
  const { db, odooConfig, supabaseUserId, name, email, phone, address } = params;
  const normalizedEmail = normalizeEmail(email);

  let partnerId: number | null = null;
  let ambiguousMatch = false;

  // 1. Mapped fast path.
  if (supabaseUserId) {
    const { data: profileRow } = await db.from("profiles").select("odoo_partner_id").eq("id", supabaseUserId).maybeSingle();
    if (profileRow?.odoo_partner_id) partnerId = profileRow.odoo_partner_id as number;
  }

  // 2. Safe, ambiguity-aware email search — only when not already mapped.
  if (!partnerId && normalizedEmail) {
    const matches = await odooSearchRead<{ id: number }>(
      odooConfig,
      "res.partner",
      [["email", "=ilike", normalizedEmail], ["type", "=", "contact"]],
      ["id"],
      { limit: 3 }
    );
    if (matches.length === 1) {
      partnerId = matches[0].id;
    } else if (matches.length > 1) {
      ambiguousMatch = true; // fall through to create — never guess which one is the real customer
    }
  }

  // 3. Create a new contact — either no match, or genuinely ambiguous.
  const structured = await resolveStructuredAddress(odooConfig, address);
  if (!partnerId) {
    partnerId = await odooCreate(odooConfig, "res.partner", {
      name,
      email: normalizedEmail || undefined,
      phone: phone || undefined,
      street: structured.street,
      street2: structured.street2 || undefined,
      city: structured.city || undefined,
      zip: structured.zip || undefined,
      state_id: structured.state_id,
      country_id: structured.country_id,
    });
  } else {
    // Keep the existing partner's contact details current — same as the previous
    // findOrCreatePartner() behavior, now scoped to the resolved (not guessed) partner only.
    await odooExecuteKw(odooConfig, "res.partner", "write", [[partnerId], { name, phone: phone || undefined }]);
  }

  // Persist the mapping for next time — additive, idempotent (same value re-written is harmless).
  if (supabaseUserId) {
    await db.from("profiles").update({ odoo_partner_id: partnerId }).eq("id", supabaseUserId).is("odoo_partner_id", null);
  }

  const shippingPartnerId = await resolveDeliveryAddress(odooConfig, partnerId, name, phone, structured);

  return { partnerId, shippingPartnerId, ambiguousMatch };
}

/** Finds-or-creates a `type: 'delivery'` child contact under the customer's own partner record for
 * this exact address — real Odoo address modeling (spec #7), not overwriting the parent's own
 * street field on every order the way the previous implementation did. Reuses an existing child
 * with the same street/street2 (a repeat order to the same address doesn't pile up duplicate
 * children); creates a new one otherwise. Never fails checkout if this step has a problem — falls
 * back to the parent partner id, since a missing delivery-child address is not worth blocking an
 * otherwise-valid order over. */
async function resolveDeliveryAddress(
  odooConfig: OdooConfig,
  parentPartnerId: number,
  name: string,
  phone: string,
  structured: StructuredOdooAddress
): Promise<number> {
  try {
    // Reuse an existing child whose STRUCTURED fields match exactly — matching on street+street2
    // alone (the old behavior) would miss that city/state/zip also need to agree now that they're
    // real fields, not folded into street2.
    const existing = await odooSearchRead<{ id: number }>(
      odooConfig,
      "res.partner",
      [
        ["parent_id", "=", parentPartnerId],
        ["type", "=", "delivery"],
        ["street", "=", structured.street],
        ["street2", "=", structured.street2],
        ["city", "=", structured.city],
        ["zip", "=", structured.zip],
      ],
      ["id"],
      { limit: 1 }
    );
    if (existing.length > 0) return existing[0].id;

    return await odooCreate(odooConfig, "res.partner", {
      parent_id: parentPartnerId,
      type: "delivery",
      name: `${name} — delivery address`,
      street: structured.street,
      street2: structured.street2 || undefined,
      city: structured.city || undefined,
      zip: structured.zip || undefined,
      state_id: structured.state_id,
      country_id: structured.country_id,
      phone: phone || undefined,
    });
  } catch (err) {
    console.error("[customerIdentity] delivery address resolution failed, falling back to parent partner", err instanceof Error ? err.message : err);
    return parentPartnerId;
  }
}

/** Formats a single display string for `orders.shipping_address` (the existing text column) from
 * structured input — keeps that column populated exactly as before, no schema change needed there.
 * Re-exported from the shared address resolver so existing callers don't need to change imports. */
export const formatShippingAddress = formatShippingAddressImpl;
