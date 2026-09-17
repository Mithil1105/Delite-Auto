# Odoo Schema Report

## Status: VERIFIED against the live instance — first real introspection in this repo's history

Every row below reflects a real `fields_get`/`search_read` response from the actual Odoo
instance (server version `19.0+e`), run via `supabase/functions/odoo-schema/` (see
`Documentations MD/odoo-supabase-edge-functions.md`). Previous versions of this file were an
unverified template — this version replaces that entirely with confirmed data.

**How this was produced**: `GET/POST` (protected by `x-internal-token`) to the deployed
`odoo-schema` Edge Function, which runs `fields_get` + a small `search_read` sample against 17
candidate models, then this file was written by hand-reading the actual JSON it returned — no
field/model below is guessed or assumed from a label alone; every "VERIFIED" row was confirmed
either by a real `fields_get` entry, a real sample value, or both. See "How to re-run this"
below.

## Executive summary (read this first)

- **Product name/price/description/stock/active/saleable/published/images**: all standard Odoo
  `product.template`/`product.product` fields, present and working as expected.
- **No custom fields exist at all.** Neither `product.template` nor `product.product` has a
  single field starting with `x_` or `x_studio_` on this instance. `ODOO_BRAND_FIELD`/
  `ODOO_VEHICLE_FIELD`/`ODOO_MRP_FIELD` (see `server/odoo/customFieldMap.ts`) have **nothing to
  point at** — there is no custom field to map them to.
- **Brand** is *not* cleanly modeled. A formal "Brand" variant attribute exists (`product.attribute`
  id 9) but has **zero values assigned** in a 40-record sample of `product.attribute.value` — it's
  defined but unused. The mechanism that's *actually* populated on real products is tagging them
  with brand-named entries in `product.public.category` (confirmed: e.g. category id 25 = "4N",
  linked to real "4N MATS" products) — but that same field also holds vehicle type, promo
  groupings, and product-type tags, all as flat siblings with no hierarchy.
- **Vehicle type (car/bike)** is the same `product.public.category` field: category id 1 = "CAR",
  id 2 = "BIKE", confirmed linked to real products via `public_categ_ids`. Not every product has
  this set (some samples show an empty `public_categ_ids`) — there's no visible "universal" tag;
  a universal product likely just omits CAR/BIKE entirely, but that's inferred, not confirmed.
- **Vehicle make/model/year/trim/fitment** are all the same thing: a generic "Model" attribute
  (`product.attribute` id 10) whose values are free text combining everything at once — e.g.
  `"Brezza 2024 / LXI"` (Maruti Brezza, year 2024, trim LXI, all in one string). There is no
  separate make/model/year/trim field or relation anywhere on this instance.
- **MRP / compare-at price**: not present. The one pricelist ("Default", INR) has per-product
  price-override items, but they're fixed-price or formula/discount entries, not a second
  "original price" concept.
- **Image gallery**: real, working `product.image` model, confirmed with real sample data — all
  sampled gallery images were linked at the **template** level (`product_variant_id` was `false`
  in every sample), not per-variant.
- **Data quality note, not a schema gap**: `product.template` contains non-catalog Odoo
  POS/service records (`"Standard delivery"`, `"Booking Fees"`, `"Tips"`, `"Settle Due"`,
  `"Deposit"`, `"Down Payment (POS)"`, `"Service on Timesheets"`, all under `categ_id`
  `"Deliveries"`/`"Services"`) mixed in with real accessory products — any future catalog fetch
  needs to filter these out (e.g. exclude those `categ_id`s, or require `public_categ_ids` to be
  non-empty).

## Mapping table

Status values: `VERIFIED` (confirmed via a real response), `NOT PRESENT` (confirmed absent on
this instance), `UNKNOWN` (not checked in this pass).

| Delite concept | Odoo model | Field/model | Type | Status | Notes |
|---|---|---|---|---|---|
| Product name | `product.template` | `name` | char, required | VERIFIED | |
| SKU | `product.template` / `product.product` | `default_code` | char | VERIFIED (field exists; usually empty) | Real samples mostly show `default_code: false` — this store largely doesn't populate SKUs |
| Price (selling) | `product.template` | `list_price` | float | VERIFIED | |
| MRP / compare-at price | — | — | — | **NOT PRESENT** | No custom field; the single pricelist's items are per-product overrides/discounts, not a second reference price |
| Description | `product.template` | `description_sale` | text | VERIFIED | |
| Category (internal/backend) | `product.category` | `name`, `parent_id`, `complete_name`, `product_count` | | VERIFIED | Sampled entries mix real categories ("Bike", "Trending Bike Accessories") with a brand-looking entry ("4N MATS") — inconsistent use |
| Category (website/storefront) | `product.public.category` | `name`, `parent_id` | | VERIFIED | **Flat** — every sampled record has `parent_id: false`. ~40 sampled entries mix vehicle type (CAR/BIKE), promo tags (POPULAR/UPCOMING/NEWLEY), product type (CAR MATS/CAR ACCESSORIES), and ~25 brand names, all as siblings |
| Brand | `product.public.category` (populated) vs. `product.attribute` id 9 "Brand" (defined, empty) | `public_categ_ids` containing a brand-named category id | many2many | VERIFIED, with caveat | The formal attribute exists but is unused (0 values in a 40-record sample); real brand signal comes from brand-named public categories instead |
| Vehicle type (car/bike) | `product.public.category` | `public_categ_ids` containing id 1 ("CAR") or 2 ("BIKE") | many2many | VERIFIED, with caveat | Confirmed on real products; not consistently populated — some real products have empty `public_categ_ids` |
| Vehicle make/model/year/trim | `product.attribute` id 10 "Model" → `product.attribute.value.name` | free text | char | VERIFIED | e.g. `"Brezza 2024 / LXI"` — make+model+year+trim combined in one unstructured string, no separate fields |
| Fitment / compatibility | same "Model" attribute (see above) | — | | VERIFIED | Same mechanism, not a distinct model/relation |
| Variants (template↔variant) | `product.template` ↔ `product.product` | `product_variant_ids`/`product_variant_count` / `product_tmpl_id` | | VERIFIED | Confirmed with a real 3-variant product (id 24, "ACTIVA SEAT COVER", colors Black/Blue/Gray) |
| Attributes in use | `product.attribute` / `.value` / `product.template.attribute.line` / `.value` | | | VERIFIED | Real attributes seen: `color` (id 1, lowercase), `Material` (id 12), `Model` (id 10); also a separate `Color`/`Size` (id 18/19) and a messy duplicate `"color HG"` (id 13) — naming is inconsistent across the catalog |
| Stock / availability | `product.template` / `product.product` | `qty_available`, `virtual_available` (both); `free_qty` (product.product only — **not present on product.template** on this instance) | float | VERIFIED | Backed by real `stock.quant` ledger entries (confirmed — see sample) |
| Active / saleable / published | `product.template` | `active`, `sale_ok`, `website_published`, `is_published` | boolean | VERIFIED | All four fields confirmed present |
| Primary image | `product.template` / `product.product` | `image_1920` (+`1024`/`512`/`256`/`128`) | binary | VERIFIED (existence only — values never fetched) | |
| Image gallery | `product.image` | `name`, `sequence`, `product_tmpl_id`, `product_variant_id` | | VERIFIED | Real sample data — all 3 sampled images linked at the **template** level (`product_variant_id: false` every time) |
| Product tags | `product.tag` | `name` | char | VERIFIED | Free-text SEO/search keywords (`"creta mats"`, `"ACTIVA"`, `"TWO WHEELERS"`) — not a brand or vehicle taxonomy |
| `product.template.tag` | — | — | — | **NOT PRESENT** | Model doesn't exist on this instance (confirmed error: `Object product.template.tag doesn't exist`) |
| Pricelist | `product.pricelist` / `product.pricelist.item` | | | VERIFIED | Exactly one pricelist ("Default", INR); items are fixed-price or formula/discount overrides per product, not an MRP mechanism |
| Non-catalog product records | `product.template` (`categ_id` "Deliveries"/"Services") | | | VERIFIED (data-quality finding) | Real POS/service artifacts (`"Standard delivery"`, `"Booking Fees"`, `"Tips"`, etc.) mixed into `product.template` — must be filtered out of any real catalog fetch |
| Customer/order data | `res.partner` / `sale.order` / `sale.order.line` | see field list below | | VERIFIED (metadata only, never sampled per instruction) | Confirmed to exist with standard fields; explicitly ruled out as a brand mechanism |
| Last updated | `product.template` | `write_date` | datetime | VERIFIED | |
| Odoo record URL ("Open in Odoo") | n/a | n/a | | UNKNOWN | Not checked this pass — see `server/odoo/adminLink.ts` |

### Field metadata for models intentionally never sampled (existence + fields only)

- `res.partner`: `name` (char), `is_company` (boolean), `supplier_rank`/`customer_rank`
  (integer), `category_id` (many2many → `res.partner.category`)
- `sale.order`: `name` (char, required), `partner_id` (many2one → `res.partner`, required),
  `amount_total` (monetary), `state` (selection: draft/sent/sale/cancel)
- `sale.order.line`: `order_id` (many2one → `sale.order`, required), `product_id` (many2one →
  `product.product`), `price_unit` (float, required), `qty_delivered` (float)

## How to re-run this

```
curl -X POST "https://zafjmlwbolgdattfdgch.supabase.co/functions/v1/odoo-schema" \
  -H "Authorization: Bearer <SUPABASE_PUBLISHABLE_KEY>" \
  -H "x-internal-token: <INTERNAL_DIAGNOSTICS_TOKEN>" \
  -H "Content-Type: application/json"
```
Both values are Supabase secrets/keys, never pasted into chat or committed. See
`Documentations MD/odoo-supabase-edge-functions.md` for the full architecture and how the
function itself works (sequential requests — an early version fired everything in parallel and
got rate-limited by Odoo; fixed to sequential with a small delay between calls).

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-15 | Claude | Initial version — template populated from standard Odoo field names; every row explicitly marked NOT VERIFIED (no live Odoo connection reachable in this environment) |
| 2026-09-15 | Claude | Second verification attempt — still no reachable deployment; status column vocabulary changed to VERIFIED/NOT PRESENT/UNKNOWN, all rows remain UNKNOWN |
| 2026-09-16 | Claude | Full rewrite — first real live introspection via the deployed `odoo-schema` Edge Function against the authenticated Odoo instance. Every row above is now VERIFIED or NOT PRESENT against real data, not assumed. Key findings: no custom fields exist at all; brand/vehicle/fitment are all modeled through `product.public.category` (flat, mixed-purpose) and a generic "Model" attribute (free-text make+model+year+trim); MRP is not present; `product.template` contains non-catalog POS/service records that need filtering |
