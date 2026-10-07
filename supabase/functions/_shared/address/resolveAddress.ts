// supabase/functions/_shared/address/resolveAddress.ts
//
// THE one shared helper for turning a customer-submitted address into structured Odoo res.partner
// fields. Replaces the previous `formatStreet2()` workaround (city/state/pincode flattened into
// free-text street2, duplicated independently in customerIdentity.ts and customer-addresses/
// index.ts) — see Documentations MD/odoo-checkout-finalization.md Phase 6.
//
// Mapping:
//   line1   -> street
//   line2   -> street2
//   city    -> city
//   pincode -> zip
//   state   -> state_id   (resolved against res.country.state, scoped to the resolved country)
//   country -> country_id (resolved against res.country; defaults to India — this store has never
//                           shipped outside India, see customerIdentity.ts's prior AddressInput
//                           comment — but a submitted non-India country is honored, not overridden)
//   phone   -> phone
//
// Never guesses a relation id. If the submitted country/state text doesn't resolve to EXACTLY one
// res.country / res.country.state record, that relation is left unset (not a wrong guess) and a
// warning is returned for the caller to log — the order is never blocked over this.

import { odooSearchRead, type OdooConfig } from "../odoo/client.ts";

export interface AddressInput {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  /** Free text; defaults to "India" when omitted — see header comment. */
  country?: string;
}

export interface StructuredOdooAddress {
  street: string;
  street2: string;
  city: string;
  zip: string;
  state_id?: number;
  country_id?: number;
  warnings: string[];
}

const DEFAULT_COUNTRY = "India";
const DEFAULT_COUNTRY_CODE = "IN";

/** Best-effort country-name -> ISO code map for the handful of countries this store could
 * plausibly ship to. Extend only with evidence — never guessed per-call. Falls back to a
 * name-based search when the country isn't in this map. */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  india: DEFAULT_COUNTRY_CODE,
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function resolveCountryId(config: OdooConfig, countryText: string): Promise<{ id: number; name: string } | null> {
  const normalized = normalize(countryText);
  const code = COUNTRY_NAME_TO_CODE[normalized];
  const domain = code ? [["code", "=", code]] : [["name", "=ilike", countryText.trim()]];
  const matches = await odooSearchRead<{ id: number; name: string }>(config, "res.country", domain, ["id", "name"], { limit: 2 });
  if (matches.length === 1) return matches[0];
  return null; // 0 or 2+ matches — never guess.
}

async function resolveStateId(config: OdooConfig, countryId: number, stateText: string): Promise<{ id: number; name: string } | null> {
  if (!stateText.trim()) return null;
  const matches = await odooSearchRead<{ id: number; name: string }>(
    config,
    "res.country.state",
    [
      ["country_id", "=", countryId],
      ["name", "=ilike", stateText.trim()],
    ],
    ["id", "name"],
    { limit: 2 }
  );
  if (matches.length === 1) return matches[0];
  // Exact (case-insensitive) match failed — try a looser contains match, still requiring
  // uniqueness. Handles e.g. "Gujarat " vs "Gujarat" punctuation drift, not a different state.
  if (matches.length === 0) {
    const loose = await odooSearchRead<{ id: number; name: string }>(
      config,
      "res.country.state",
      [
        ["country_id", "=", countryId],
        ["name", "ilike", stateText.trim()],
      ],
      ["id", "name"],
      { limit: 2 }
    );
    if (loose.length === 1) return loose[0];
  }
  return null;
}

/** Builds the structured Odoo res.partner address payload for this submitted address. Never
 * throws — a failed country/state lookup degrades to an unset relation + warning, never blocks
 * checkout and never writes a guessed id. */
export async function resolveStructuredAddress(config: OdooConfig, address: AddressInput): Promise<StructuredOdooAddress> {
  const warnings: string[] = [];
  const countryText = address.country?.trim() || DEFAULT_COUNTRY;

  let countryId: number | undefined;
  let stateId: number | undefined;
  try {
    const country = await resolveCountryId(config, countryText);
    if (country) {
      countryId = country.id;
      const state = await resolveStateId(config, country.id, address.state);
      if (state) {
        stateId = state.id;
      } else if (address.state?.trim()) {
        warnings.push(`state "${address.state}" could not be uniquely resolved against res.country.state for ${country.name} — left unset`);
      }
    } else {
      warnings.push(`country "${countryText}" could not be uniquely resolved against res.country — country_id and state_id left unset`);
    }
  } catch (err) {
    warnings.push(`address resolution failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}`);
  }

  return {
    street: address.line1,
    street2: address.line2 || "",
    city: address.city,
    zip: address.pincode,
    state_id: stateId,
    country_id: countryId,
    warnings,
  };
}

/** Formats a single display string for Supabase's own `orders.shipping_address` text column —
 * unchanged from the previous behavior, kept here since it's the natural home for address
 * formatting now. */
export function formatShippingAddress(address: AddressInput): string {
  return [address.line1, address.line2, address.city, address.state, address.pincode, address.country]
    .filter((p) => p?.trim())
    .join(", ");
}
