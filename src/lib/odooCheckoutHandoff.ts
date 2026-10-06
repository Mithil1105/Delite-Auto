// src/lib/odooCheckoutHandoff.ts
//
// Builds the cart payload handed off to Odoo's own native checkout (Documentations MD/
// odoo-native-checkout.md) — the production checkout path as of this pass. React's job ends at
// "here is what's in the cart"; Odoo is solely authoritative for price, discount, tax, delivery,
// and payment from this point on. This module never reads or sends any of those.
//
// Payload travels in the URL fragment (never sent to any server in the HTTP request line, never
// logged) to a same-origin Odoo "Embed Code" handoff page — see
// Documentations MD/odoo-checkout-handoff-embed-code.html for the page-side script this feeds.

import { catalogService } from "../services/catalog/catalogService";
import type { Product } from "../data/types";

const MAX_LINES = 20;
const MAX_QTY = 50;

/** The Odoo checkout handoff page's path, relative to VITE_ODOO_CHECKOUT_BASE_URL. Fixed — not
 * environment-configurable, since the page itself (not just its domain) is a specific, known
 * route the Odoo-side Embed Code script was written for. Only the base URL changes between the
 * development domain (www.deliteauto.com) and the eventual shop.deliteauto.com. */
const HANDOFF_PATH = "/checkout-handoff-test";

export interface OdooHandoffLine {
  productTemplateId: number;
  productId: number;
  quantity: number;
}

export interface OdooHandoffPayload {
  v: 1;
  lines: OdooHandoffLine[];
}

/** Structural, not CartContext's own (unexported) CartLine type — only the fields this module
 * actually needs, so it doesn't have to import/couple to cart internals. */
export interface HandoffCartLine {
  product: Pick<Product, "odooId" | "slug" | "name">;
  qty: number;
  variantId?: string;
}

export class HandoffValidationError extends Error {}

/** Resolves a product with no explicitly-selected variant (the common case today — no cart UI
 * collects a variant choice yet for single-variant products) to its one real Odoo
 * `product.product` id. Fails rather than guesses for zero or multiple variants — a multi-variant
 * product reaching checkout without a selection is an upstream bug, never silently resolved. */
async function resolveDefaultVariantId(slug: string, name: string): Promise<number> {
  const detail = await catalogService.getProductBySlug(slug).catch(() => null);
  const variants = (detail?.variants ?? []).filter((v) => typeof v.odooVariantId === "number" && v.odooVariantId! > 0);
  if (variants.length === 1) return variants[0].odooVariantId!;
  throw new HandoffValidationError(`"${name}" can't be sent to checkout right now — please remove and re-add it.`);
}

/** Builds and validates the handoff payload from the current React cart. Never includes price,
 * discount, tax, shipping, or total — only real Odoo product identity + quantity. Throws
 * HandoffValidationError (with a customer-safe message) rather than silently dropping or guessing
 * at an invalid line — see Documentations MD/odoo-native-checkout.md Step 1. */
export async function buildHandoffPayload(lines: HandoffCartLine[]): Promise<OdooHandoffPayload> {
  if (lines.length === 0) throw new HandoffValidationError("Your cart is empty.");

  const resolved = await Promise.all(
    lines.map(async (line): Promise<OdooHandoffLine> => {
      const templateId = line.product.odooId;
      if (typeof templateId !== "number" || !Number.isInteger(templateId) || templateId <= 0) {
        throw new HandoffValidationError(`"${line.product.name}" can't be sent to checkout — please remove and re-add it.`);
      }
      if (!Number.isInteger(line.qty) || line.qty <= 0) {
        throw new HandoffValidationError(`"${line.product.name}" has an invalid quantity — please update it in your cart.`);
      }
      let variantId = line.variantId ? Number(line.variantId) : undefined;
      if (!variantId || !Number.isInteger(variantId) || variantId <= 0) {
        variantId = await resolveDefaultVariantId(line.product.slug, line.product.name);
      }
      return { productTemplateId: templateId, productId: variantId, quantity: Math.min(line.qty, MAX_QTY) };
    })
  );

  // Merge duplicate productId entries (same variant added via two separate cart lines, e.g. once
  // with and once without a stale variantId) rather than sending Odoo two add calls for the same
  // product and relying on its own increment behavior to "just work out".
  const merged = new Map<number, OdooHandoffLine>();
  for (const line of resolved) {
    const existing = merged.get(line.productId);
    if (existing) {
      existing.quantity = Math.min(existing.quantity + line.quantity, MAX_QTY);
    } else {
      merged.set(line.productId, { ...line });
    }
  }

  const mergedLines = Array.from(merged.values());
  if (mergedLines.length > MAX_LINES) {
    throw new HandoffValidationError(`Your cart has too many different products for checkout (max ${MAX_LINES}) — please remove some items.`);
  }

  return { v: 1, lines: mergedLines };
}

function encodeHandoffFragment(payload: OdooHandoffPayload): string {
  return encodeURIComponent(JSON.stringify(payload));
}

/** Builds the full cross-domain handoff URL. Throws if the checkout base URL isn't configured
 * (VITE_ODOO_CHECKOUT_BASE_URL) rather than silently producing a broken relative link. */
export function buildHandoffUrl(payload: OdooHandoffPayload): string {
  const base = (import.meta.env.VITE_ODOO_CHECKOUT_BASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) throw new HandoffValidationError("Checkout is temporarily unavailable — please try again shortly.");
  return `${base}${HANDOFF_PATH}#${encodeHandoffFragment(payload)}`;
}

/** Full end-to-end: validate the cart, build the payload, build the URL. Callers navigate with
 * `window.location.assign(url)` — a real cross-domain full-page navigation, never React Router
 * (see Documentations MD/odoo-native-checkout.md — this is deliberate: it's what lets the
 * browser receive Odoo's own session cookie normally). */
export async function buildOdooHandoffUrl(lines: HandoffCartLine[]): Promise<string> {
  const payload = await buildHandoffPayload(lines);
  return buildHandoffUrl(payload);
}
