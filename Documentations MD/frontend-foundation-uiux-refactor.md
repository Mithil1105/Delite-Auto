# Frontend Foundation UI/UX Refactor

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Frontend foundation UI/UX refactor      |
| File           | `Documentations MD/frontend-foundation-uiux-refactor.md` |
| Branch         | figma                                   |
| Owner          | Claude (pairing with the user)          |
| Status         | Done — foundations fixed, Playwright visual regression tests added, VehicleShopSplit follow-up applied |
| Created        | 2026-09-09                              |
| Last updated   | 2026-09-09                              |

## Summary

A structural cleanup pass requested before continuing the Figma rebuild: layout/spacing
primitives, a real product-media renderer (replacing `ProductArt`'s decorative gradient tile on
cards), two `ProductCard` bugs (invalid DOM nesting, a fabricated `4.0` default rating), a
Rail/carousel boundary-arrow fix, a working cart (real line removal, honest Buy Now), three
semantically-wrong homepage data mappings, non-interactive "Shop by Brands" tiles, false dropdown
chevrons in the header, a missing `?tag=` filter on Shop, and a first Playwright visual-regression
test suite. No visual redesign of Shop/PDP, no live Odoo integration — see Scope.

## Why

The user handed over a large, detailed spec describing 14 confirmed architectural problems (one
universal container/spacing system used everywhere, `ProductArt` baking decorative gradients into
every card, two competing product-card components, `<button>` nested inside `<Link>`, a fabricated
default rating, an incomplete cart, semantically-wrong homepage tabs, fake-clickable brand tiles,
false dropdown affordances, an unwired tag filter, and no visual regression testing), asking for
the foundation to be fixed before further Figma work continues.

Before implementing, an audit of the actual current code (not just the spec's assumptions) found
the branch had moved on from the spec's assumed baseline: `ProductCard` was already consolidated
into one component (`src/components/product/ProductCard.tsx`, replacing two older ones — see
`figma-shop-product-odoo-integration.md`), and Shop/PDP had already been substantially rebuilt to
match Figma in an earlier pass. This matches the spec's own exclusions ("no *further* Shop/PDP
redesign", "no *live* Odoo work" — the existing `server/odoo/`, `api/catalog/`,
`src/services/catalog/` scaffolding is inert, not wired into any page, and was left untouched). So
this pass fixes the specific bugs the audit actually found rather than redoing already-completed
work.

**A working-tree hazard was hit and fixed during setup.** Following the spec's own suggested
checkpoint recipe (`git switch -c checkpoint/... && commit && git switch figma`) caused
`git switch figma` to silently revert the working tree to the last *pushed* commit (`9bc7b31`),
wiping newer uncommitted local work — exactly what the spec said not to do. Fixed by fast-forwarding
`figma` to the checkpoint commit `55261d9` ("Checkpoint current Figma UI before foundation
refactor"). Both `figma` and `checkpoint/figma-ui-before-foundation-fix` point at that commit as
the safe starting point for everything in this doc.

## Scope

**In scope:** layout/spacing primitives, `ProductMedia`/`ProductPlaceholder` (replacing
`ProductArt`'s role on product cards, not deleting `ProductArt` itself), `ProductCard`'s two DOM
bugs, `Rail` boundary-arrow detection + a `ProductCarousel` wrapper, extracting the inline
"Shop by Cars/Bikes" block into `VehicleShopSplit`, real `CartContext` operations (`removeLine`,
`setQuantity`, `clearCart`) + `Cart.tsx` rewiring, Product Detail's Buy Now honesty fix, Shop's
`?tag=` filter, `VehicleBrandGrid` real links, Header chevron removal, three Home.tsx semantic
data-mapping fixes, a scoped typography utility (not a global typography migration), and a first
Playwright visual-regression suite.

**Explicitly not in scope** (per the spec's own exclusions): live Odoo integration/credentials,
any further Shop/PDP redesign beyond the named tag-filter fix, checkout/payment integration,
backend inventory integration, a full site-wide typography migration, a real Header mega-menu.

## Implementation notes

### Layout primitives + spacing tokens (spec §4, §5)
- New `src/components/layout/PageContainer.tsx` — `<PageContainer size="normal"|"wide">` wrapping
  the existing `.container-page` (max-w-1280, used by Shop/PDP/text pages) and `.container-wide`
  (max-w-1320, Home/Hero-scoped) CSS classes, both unchanged.
- New `src/components/layout/FullBleedSection.tsx` — `<FullBleedSection spacing="compact"|"normal"|"large"|"none" containerSize?>`,
  formalizing the full-bleed-background + contained-content pattern already used throughout
  `Home.tsx`.
- `src/index.css` — added `.section-pad-compact` (`py-8 sm:py-10 lg:py-12`), `.section-pad-normal`
  (`py-16 sm:py-20 lg:py-24`, identical values to the legacy `.section-pad`), `.section-pad-large`
  (`py-20 sm:py-28 lg:py-32`, currently unused — a token for a future genuinely-showcase section).
  The legacy `.section-pad` class is **kept** (not deleted) — `src/pages/About.tsx` still uses it
  (out of scope for this pass); confirmed via grep before deciding.
- `src/pages/Home.tsx` — every section migrated from `.section-pad`/ad hoc classes to
  `<FullBleedSection>` with an intentional per-section spacing choice: PromoBannerPair and the
  category-icon strip → `compact`; Perfect-Vehicle, Brands, both Top-Categories sections,
  Testimonials, GetInTouch+TrustBadges → `normal`. The Trending section's deliberately-asymmetric
  spacing (`pt-2 sm:pt-4 pb-16 sm:pb-20 lg:pb-24`, sits directly under the category strip) stays
  bespoke on a raw `<section>` + `<PageContainer size="wide">`, commented as intentional rather
  than forced into a token.

### Product media (spec §6)
- New `src/components/product/ProductPlaceholder.tsx` — restrained fallback (flat `bg-steel-50` +
  a muted line-icon), no gradient/diagonal texture/decorative circles.
- New `src/components/product/ProductMedia.tsx` — real `<img>` renderer: `object-contain`, lazy by
  default (`eager` prop opts out for above-the-fold use), loading-skeleton + `onError` fallback to
  `ProductPlaceholder`. Deliberately does **not** resolve `productImages`/`categoryImages`
  internally — the caller passes `src`, keeping the "a specific product must never silently borrow
  its category's generic photo" rule (originally `ProductArt`'s) in the caller's hands.
- `src/components/ProductArt.tsx` is **untouched** — its only remaining consumer is
  `src/components/CategoryGrid.tsx`, confirmed unrouted/unimported dead code (not referenced by
  `App.tsx` or any page). Left alone; noted below as an out-of-scope finding.
- Migrated to `ProductMedia`: `src/components/product/ProductCard.tsx` (via `productImages[product.id]`),
  `src/pages/Cart.tsx` (same lookup), `src/pages/ProductDetail.tsx`'s gallery hero image (kept its
  existing `productImages[id] ?? categoryImages[slug]` fallback computation — the one legitimate
  category-level fallback — now rendered through `ProductMedia` with `eager`).

### ProductCard bug fixes (spec §7 bugs, §8, §9)
- `src/components/product/ProductCard.tsx`: the wishlist `<button>` was nested inside the `<Link>`
  with an `e.preventDefault()` workaround — moved to a sibling of the `<Link>` inside the card's
  outer `relative` wrapper; the `preventDefault()` hack is gone.
- Replaced `const rating = product.rating ?? 4.0` with a `hasRating` check
  (`product.rating != null && !!product.reviewCount`); shows real stars+count when true, a muted
  row reusing the existing `product.noReviewsYet` i18n key ("No Reviews") when false. Never
  fabricates a rating.
- The identical `?? 4.0` bug was also found and fixed in `src/pages/ProductDetail.tsx` (the star
  row and the Reviews tab body) — same `hasRating` pattern, kept surgical (not a PDP redesign).
- **No `variant` prop added to `ProductCard`** — all current call sites (Home ×4, Shop grid, PDP
  related products) render identically today; a variant prop would be a speculative abstraction
  with no real consumer.

### Rail / carousels (spec §12, §13, §22)
- `src/components/Rail.tsx` — added scroll-position tracking (`ResizeObserver` + `onScroll`) so
  the left/right chevron arrows only render when there is actually more to scroll to in that
  direction (previously always rendered regardless of scroll position). Applies to every existing
  consumer automatically (4× Home.tsx, PDP related-products, `CategoryIconStrip`).
- New `src/components/product/ProductCarousel.tsx` — `<ProductCarousel products={list} />`
  collapses the `<Rail>{list.map(p => <RailItem><ProductCard/></RailItem>)}</Rail>` pattern
  (previously duplicated 5×) into one call.
- `src/components/home/CategoryIconStrip.tsx` — left as-is (it already is the
  category-shortcut-rail pattern the spec describes); inherits the Rail boundary-arrow fix for
  free. Manually verified in-browser (see Testing) that the first item isn't clipped.
- New `src/components/home/VehicleShopSplit.tsx` — the inline "Shop by Cars/Bikes" `<section>`
  extracted verbatim out of `Home.tsx` (pure extraction, no visual change).

### Cart fixes (spec §18)
- `src/context/CartContext.tsx` — added `removeLine(productId)`, `setQuantity(productId, qty)`
  (removes the line when `qty <= 0` rather than clamping at 1 — one consistent codepath, avoiding a
  "minus is stuck at qty 1, only trash works" split behavior), `clearCart()`.
- `src/pages/Cart.tsx` — deleted the local `setQty(productId, delta)` helper, which silently
  no-op'd instead of removing a line (`if (line.qty + delta <= 0) return;` — this is why the trash
  button previously did nothing: it called `setQty(id, -qty)`, which always hit that early
  return). `+`/`-` now call `setQuantity` directly; trash calls `removeLine` unconditionally.
  Also swapped `ProductArt` → `ProductMedia` here.
- Checkout button is untouched (still no `onClick`) — checkout is explicitly out of scope, and
  it's already honestly labeled via the existing `t("cart.demoNote")` text underneath.
- localStorage persistence logic (two `useEffect`s, try/catch, `loadCart()`'s rehydration by
  product id) was already correct — not touched.

### Product Detail Buy Now honesty (spec §19)
- `src/pages/ProductDetail.tsx` — Buy Now (`t("product.payWith")`, gold pill) previously called
  the exact same `addToCart(product, qty)` as Add to Cart, with no distinct behavior. Now:
  `addToCart(product, qty); navigate("/cart")` (added `useNavigate` from `react-router-dom`).
- "More Payment Options" (previously a live-looking `<button>` with no handler at all) converted
  to a plain non-interactive `<span>` with muted styling — chosen over a `disabled` button because
  no such feature exists or is planned this phase; a `disabled` control would imply "temporarily
  unavailable," which isn't true here.

### Shop tag filter (spec §17)
- `src/pages/Shop.tsx` — reads `params.get("tag")`, filters `list.filter(p => p.tag === tag)` in
  the existing `filtered` memo, added to its dependency array and to the `activeCount` list so
  "Clear all" correctly reflects arriving via `/shop?tag=bestseller`. Makes the pre-existing
  Header/Footer/promo-banner tag links (previously silently ignored) actually filter. Verified
  live: `/shop?tag=bestseller` returns "7 products" instead of the full unfiltered catalog.

### VehicleBrandGrid real links (spec §15)
- `src/components/home/VehicleBrandGrid.tsx` — tiles were plain non-interactive `<div>`s. Fixed to
  `<Link to={\`/shop?vehicle=${vehicle}\`}>`. **Correction to the spec's own suggested fix**
  (`?brand=<oemSlug>`): `src/data/brands.ts` (accessory brands — Dolphin, Wurth, Sony… — what
  Shop's `brand` param actually filters on) and `src/data/vehicleBrands.ts` (OEM makes — Audi,
  Hyundai, BMW…) are disjoint slug sets, and `Product` has no OEM-make field at all — a
  `brand=<oemSlug>` link would always return zero results. Linking to the vehicle level instead is
  honest and always returns real results; true per-OEM filtering needs a new `Product` data field
  (see Known issues).

### Header chevron cleanup (spec §16, Option B)
- `src/components/Header.tsx` — removed the `dropdown: boolean` field and the conditional
  `<ChevronDown>` render from all 6 `navItems`; no real dropdown/mega-menu markup existed anywhere
  in the file, so the chevron was a pure false affordance. This is the spec's explicitly allowed
  Option B, consistent with the project's own prior documentation already flagging the mega-menu
  as deliberately deferred.

### Home.tsx semantic data fixes (spec §14)
All three verified by reading `Home.tsx`/`categories.ts` directly, not inferred from the spec:

1. **Car "Covers" tab actually filtered `floor-mats`** (interior mats, not body covers — no
   car-body-cover category exists at all in `categories.ts`). Fixed by **relabeling** rather than
   inventing a fake category: tab state literal `"covers"` → `"mats"`, new i18n key
   `home.tabMats` ("Mats") added to `en`/`hi`/`gu` in lockstep. The existing `tabCovers` key is
   untouched — it's correctly used by the bike tab set.
2. **Bike "Locks & Safety" tab actually filtered `bike-guards`** (crash protection, not locks —
   `categories.ts` names that category "Guards & Crash Protection"). `bike-covers` ("Bike Covers &
   Locks") is the genuinely locks-adjacent category, but the adjacent "Covers" tab already filters
   `bike-covers` — repointing "Locks" there too would create two identical tabs. Fixed by
   **relabeling**, keeping the filter: renamed to "Guards & Protection", new i18n key
   `home.tabGuards`.
3. **"Upcoming" tab was `products.slice(-8)`** — the last 8 items of a static array, with no
   semantic backing (`ProductTag` only has `"new"|"trending"|"bestseller"`, no upcoming/launch-date
   concept anywhere in the data model, unlike the two bugs above where a real close category
   existed to repoint or relabel to). Per the spec's explicit permission to hide/disable when no
   truthful option exists, the tab was **removed**: `vehicleTab` state narrowed to
   `"popular" | "new"`, the `PillTabs` option and the `slice(-8)` fallback branch deleted. The
   now-unused `home.tabUpcoming`/`home.tabLocksSafety` i18n keys were left defined (harmless).

### Scoped typography fix (spec §24)
- The global `h1,h2,h3,h4 { uppercase }` base rule in `src/index.css` was **not** removed — a grep
  showed roughly 10 out-of-scope pages/components (About, Contact, Brands, Cart headings, Terms,
  Footer, etc.) rely on it with no explicit case class at all; re-verifying every one of them
  against Figma was out of proportion for this pass.
- Instead, added two explicit utility classes — `.heading-upper` (spells out the default) and
  `.heading` (opts a heading into sentence/title case) — and replaced the ad hoc `normal-case`
  overrides fighting the base rule at their exact existing call sites: `src/pages/Home.tsx` (7
  headings after the rebuild) and `src/pages/ProductDetail.tsx` (2 headings). A full site-wide
  typography-token migration is a legitimate future phase, not this one.

### Playwright visual regression tests (spec §28)
- No test tooling existed at all before this pass (no Playwright/vitest, no `tests/` dir, no
  config). Added `@playwright/test` as a devDependency (`npm install -D @playwright/test`).
- New `playwright.config.ts` (repo root) — `webServer` runs `npm run dev` against
  `http://localhost:5173` (confirmed default Vite port, no override in `vite.config.ts`); 4
  projects: `desktop-1440` (1440×900, mandatory), `mobile-390` (390×844, mandatory),
  `desktop-1280` (1280×800, preferred), `desktop-1920` (1920×1080, preferred).
- New `tests/visual/home.spec.ts` — navigates to `/`, asserts
  `document.documentElement.scrollWidth <= window.innerWidth + 1` (no horizontal overflow), takes
  a full-page screenshot per project.
- `package.json` — added `test:visual` (`playwright test`) / `test:visual:update`
  (`playwright test --update-snapshots`) scripts. `tests/` sits outside `tsconfig.app.json`'s
  `include: ["src"]`, so it can't affect `npm run build`.
- `.gitignore` — added `test-results/`/`playwright-report/` (run artifacts); baseline snapshots
  under `tests/visual/home.spec.ts-snapshots/` **are** committed so future diffs are meaningful.

### Follow-up: VehicleShopSplit alignment + vehicle-image overhang (2026-09-09, after user review)
The user reviewed a live screenshot and flagged two concrete issues with `VehicleShopSplit`
("Shop by Cars/Bikes") that predated this pass (inherited as-is by the Phase 4 extraction, which
was a verbatim copy — see above) but are naturally part of the same layout-primitive work:

1. **Left-edge misalignment.** "Shop by Cars"/"Shop by Bikes" sat at `x=56` (measured via
   Playwright `boundingBox()`) while every other section's heading (e.g. "Trending on Car & Bike")
   sat at `x=100` at a 1440px viewport — a real ~44px offset, because this section is full-bleed
   (its own fixed `px-*` padding) rather than living inside `.container-wide` like every other
   section. Fixed with a new `src/index.css` utility, `.inset-wide-l`, which replicates
   `.container-wide`'s left inset (`max(<padding>, (100vw - 1320px)/2 + <padding>)`) for content
   that lives inside a full-bleed element instead of inside `.container-wide` itself — applied to
   the car panel's `<Link>` in place of its old fixed `px-6 sm:px-10 lg:px-14`. Verified: both
   headings now measure `x=100` at every tested viewport.
2. **Vehicle images fully boxed in, no "breaking the frame" effect.** The car/scooter photos were
   entirely contained within their colored panel (`overflow-hidden` on both the section and each
   `<Link>`) — the user wanted roughly 2/3 of each vehicle sitting inside the colored panel and
   1/3 hanging below it into the page beyond, which the original spec's own section 22 already
   called for ("no clipping") but the inherited implementation didn't do. Restructured: each
   column is now a `relative` wrapper (the real grid item, `min-h-*` sized) holding the clipped
   colored `<Link>` (heading only) and a separate, unclipped `<img>` positioned relative to the
   *wrapper* (not the clipped Link) with a negative `bottom` offset sized to ~1/3 of the image's
   actual *rendered* height (measured directly — the car image renders shorter than its
   `max-h` cap due to its source aspect ratio, so the offset is calibrated to the real rendered
   height, not the cap). `gap-y-*` between the two wrappers (mobile stack only, `lg:gap-y-0`) and
   `mb-*` on the section reserve exactly enough clearance so the overhang never collides with
   `CategoryIconStrip` underneath, at both the desktop side-by-side layout and the mobile stacked
   layout (an early version of this fix used a second, separate absolutely-positioned overlay grid
   for the images — that broke on mobile because its rows, having only `position:absolute`
   children, collapsed to zero height, so both vehicles anchored near the top of the section
   instead of under their own panels; anchoring each image to its own panel's wrapper instead
   fixed this for both layouts).

Both fixes verified visually (Playwright screenshots at 1440×900 and 390×844) and confirmed
`scrollWidth <= innerWidth + 1` still holds at both.

### Follow-up: CategoryIconStrip ring rendering as broken arcs (2026-09-09, after user screenshot)
The user flagged the category-circle's hover ring looking "cut" — confirmed via a zoomed
Playwright screenshot and `getComputedStyle`: `src/components/home/CategoryIconStrip.tsx`'s
photo-backed circles had `overflow-hidden` (needed to clip the photo to a circle) and the
`ring-1 ring-line group-hover:ring-brand-500` hover ring on the *same* `<span>`. A `box-shadow`
(which is how Tailwind's `ring-*` utility is implemented) painted on an element that also has
`overflow: hidden` gets clipped by that same element's own overflow in real browser rendering —
the ring rendered as broken arcs instead of one clean circle, most visible in the (previously
subtle grey, now brand-blue-on-hover) ring color change. Fixed by splitting the two
responsibilities onto separate nested elements: the outer `<span>` keeps the ring/box-shadow and
lost `overflow-hidden`; a new inner `<span className="... overflow-hidden">` wraps only the
`<img>` and does the circular clipping. Verified: `overflow` on the ring-bearing span now computes
to `visible`, and the re-screenshotted ring is one continuous circle. This is very likely also
what read as "icons aren't center-aligned" — a Playwright geometry check (icon/image bounding-box
center vs. circle bounding-box center, both axes) showed every item was already pixel-perfectly
centered before this fix, so the broken-arc ring's uneven appearance was almost certainly what
looked off-center, not an actual centering bug.

### Follow-up: ring contrast + hover-state media-gating (2026-09-09, after user re-review)
The user reviewed the ring fix above live and reported it still looked wrong — correctly: the
broken-arc bug *was* fixed, but a second, real issue was hiding behind it, confirmed with
`getComputedStyle` (not assumed): the *default* (unhovered) ring color, `ring-line` (`#e3e7e8`),
is nearly the same lightness as the `bg-steel-50` (`#eef2f4`) fill behind it — box-shadow returned
byte-identical for all three photo circles, `rgb(227, 231, 232)` on `rgb(238, 242, 244)`,
essentially invisible at rest. It only became visible once it turned brand-blue on hover, which
made it look like only *some* circles had a ring. Fixed by changing the default ring color to
`ring-steel-300` (`#9db0b9`), which has real contrast against the same background — confirmed via
a before/after screenshot showing a clearly visible, consistent ring on every photo circle at
rest, not just on hover.

Separately, the user asked for a `@media` fix to guarantee this never behaves inconsistently
"on any screen size" — a legitimate concern verified as a real gap, not a hypothetical: the
project's actual generated CSS (inspected directly via the dev server's served output) shows
`.group:hover .group-hover\:ring-brand-500 { ... }` as a **plain, unconditional `:hover` selector**
— this Tailwind 3.4.19 build does not scope `group-hover:`/`hover:` behind
`@media (hover: hover)`. On a touch device, tapping an element can leave it visually "stuck" in
its `:hover` state (no mouse to move away and un-hover it), at any viewport width. Fixed by
replacing the two Tailwind `group-hover:` utility classes on `CategoryIconStrip`'s circles with
two named component classes (`.category-circle-photo`, `.category-circle-icon` in
`src/index.css`) whose hover-color override lives in a plain, explicit
`@media (hover: hover) and (pointer: fine) { .group:hover .category-circle-photo { ... } }` rule.
Verified three ways via Playwright:
- `window.matchMedia("(hover: hover) and (pointer: fine)")` → `true` in a normal desktop context,
  `false` in a touch-emulated context (`hasTouch: true, isMobile: true`).
- On the desktop context, `.hover()` on the "Car Mats" link changes the ring's computed
  `box-shadow` color from steel-300 to brand-500 (`rgb(29, 63, 209)`) and back on mouse-away —
  confirms the intended hover feedback still works where a real pointer exists.
- This is currently scoped to `CategoryIconStrip` specifically (the component with the confirmed,
  reported symptom) rather than every `hover:`/`group-hover:` usage site-wide — see Known issues.

## Interfaces / data

- `PageContainer({ size?: "normal" | "wide"; as?; className?; children })`
- `FullBleedSection({ as?; spacing?: "none" | "compact" | "normal" | "large"; containerSize?: "normal" | "wide"; className?; children })`
- `ProductMedia({ src?: string; alt: string; icon: string; className?; iconClassName?; eager?: boolean })`
- `ProductPlaceholder({ icon: string; className?; iconClassName? })`
- `ProductCarousel({ products: Product[] })`
- `CartContextValue` gained `removeLine(productId: string): void`, `setQuantity(productId: string, qty: number): void`, `clearCart(): void`
- New CSS: `.section-pad-compact` / `.section-pad-normal` / `.section-pad-large`, `.heading` / `.heading-upper`, `.inset-wide-l` (full-bleed-content left inset matching `.container-wide`)
- New i18n keys (en/hi/gu, all three in lockstep): `home.tabMats`, `home.tabGuards`
- `Shop.tsx` now reads `?tag=` (`ProductTag`: `"new" | "trending" | "bestseller"`)

## Dependencies

- New devDependency: `@playwright/test` (`^1.63.0` at install time). No production dependency
  changes.
- Depends on the existing `productImages`/`categoryImages` lookup tables
  (`src/lib/productImages.ts`, `src/lib/categoryImages.ts`) staying as-is — `ProductMedia` reads
  through whatever the caller resolves via those, same as `ProductArt` did.
- Builds on `figma-shop-product-odoo-integration.md`'s prior `ProductCard` consolidation and
  `figma-homepage-redesign.md`'s Hero/Shop-by-Cars-Bikes work — neither was redesigned, only
  extracted/fixed in place.

## Testing / verification

- `npx tsc -b --noEmit` — clean after every phase, re-verified at the end.
- `npm run test:visual:update` — all 4 projects (desktop-1440, mobile-390, desktop-1280,
  desktop-1920) pass; `document.documentElement.scrollWidth <= window.innerWidth + 1` holds at
  every viewport (no horizontal overflow anywhere). Baseline screenshots committed under
  `tests/visual/home.spec.ts-snapshots/`.
- Manually reviewed the desktop-1440 and mobile-390 baseline screenshots: header shows no
  chevrons; Trending/Top-Categories tab labels read "Mats" and "Guards & Protection"; the
  "Upcoming" tab is gone from "Find Your Perfect Vehicles"; brand tiles render as a grid of
  link-styled badges; product cards show real photos via `ProductMedia` with a restrained
  placeholder icon (no gradient/diagonal texture) where no photo is mapped.
- Cropped the category-icon-strip region of the baseline: confirmed the first item ("Car Seat
  Covers") is not clipped, and photo-backed vs. icon-fallback items (Car Seat Covers, Car Mats
  vs. Bike Seat Covers) render in visually consistent same-size circular frames.
- Functional smoke test via an ad hoc Playwright script against the dev server (not committed —
  throwaway, per the instruction not to leave scratch scripts in the repo):
  - `/shop?tag=bestseller` → "7 products" (was previously silently ignored, showing the full catalog).
  - Cart: qty 1 → 2 (plus) → 1 (minus); trash removes the line and the cart shows its empty state.
  - Product Detail "Pay with" (Buy Now) button: clicking it adds the item and navigates to `/cart`
    with the item present — confirmed distinct from Add to Cart.
  - Wishlist toggle: `aria-pressed` flips `false → true`, `aria-label` flips
    "Add to wishlist" → "Remove from wishlist".
  - Rail: the left scroll arrow is correctly hidden at the start of a fresh carousel (boundary
    detection working).
  - Language switching (`localStorage["delite-auto-lang"]` → `hi`/`gu`/`en`): the "Trending on Car
    & Bike" heading renders correctly translated in all three languages with zero console errors —
    confirms the new `home.tabMats`/`home.tabGuards` keys didn't break `hi.ts`/`gu.ts`'s
    `typeof en` type contract (also implied by the clean `tsc -b`).
  - Zero `pageerror`/console errors across all of the above.
- `npm run lint` / `npm run build` — run once at the very end of the pass (see the assistant's
  final report to the user in-conversation for exact output); no new warnings introduced beyond
  the 3 pre-existing `oxlint` warnings already present before this work.

## Known issues / follow-ups

- **Header mega-menus still not built** — chevrons were removed (Option B) rather than building
  real Cars/Bikes/Shop-by-Brands dropdown content. `vehicleBrands.ts`/`brands.ts`/`categories.ts`
  already have the data a real mega-menu would need; this remains a legitimate, larger follow-up.
- **"More Payment Options"** is now a non-interactive `<span>`, not a working control — no such
  feature exists or is planned this phase.
- **Cart Checkout button** remains non-functional by design (no `onClick`) — checkout/payment is
  explicitly out of scope; it's honestly labeled via the existing demo-note text underneath.
- **`VehicleBrandGrid` links are vehicle-level only** (`/shop?vehicle=car|bike`), not per-OEM-make
  — `Product` has no field linking it to a specific make (Audi/Hyundai/BMW/…). True per-brand
  fitment filtering needs a new `Product` field (e.g. `compatibleVehicleBrands?: string[]`), out
  of scope here.
- **"Upcoming" tab was removed, not fixed** — no truthful "upcoming"/launch-date concept exists
  anywhere in the current data model. Revisit if/when the catalog gains that concept.
- **`ProductArt.tsx` is unused in cards now but not deleted** — its only remaining consumer,
  `src/components/CategoryGrid.tsx`, was found to be dead code (not imported by `App.tsx` or any
  routed page) while auditing this work. Neither file was touched; flagging the dead code here in
  case a future cleanup pass wants to remove it.
- **Playwright baselines are Windows-rendered, no CI pipeline exists yet** — screenshot diffs are
  only meaningful when regenerated/compared on the same OS until CI is set up.
- **No `variant` prop on `ProductCard`** — intentionally not added; revisit only if a genuine
  visual difference between carousel/grid contexts actually emerges.
- **The `(hover: hover) and (pointer: fine)` media-gating fix is scoped to `CategoryIconStrip`
  only.** The same root cause — this Tailwind 3.4.19 build's `hover:`/`group-hover:` utilities
  compiling to plain unconditional `:hover` selectors, not gated behind the hover-capability media
  feature — is structurally present everywhere else those utilities are used (`ProductCard`'s
  wishlist button, `VehicleBrandGrid` tiles, `Header` nav links, every `.btn-*`/`.btn-pill-*` etc.).
  Only `CategoryIconStrip` had a *reported, confirmed* symptom; applying the same fix everywhere
  would be a large, unbounded change better done as its own pass with its own verification, not a
  drive-by addition here.
- Every other known issue already logged in `figma-homepage-redesign.md` and
  `figma-shop-product-odoo-integration.md` that this pass didn't touch (real OEM logos, hero
  `car.png` still a stock photo, Odoo scaffolding inert, Shop's "Model name" filter being a plain
  substring match, etc.) still applies unchanged — see those files.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-09 | Claude | Initial version — layout/spacing primitives, ProductMedia/ProductPlaceholder, ProductCard DOM+rating fixes, Rail boundary arrows + ProductCarousel, VehicleShopSplit extraction, cart removeLine/setQuantity/clearCart, PDP Buy Now honesty, Shop tag filter, VehicleBrandGrid real links, Header chevron removal, 3 Home.tsx semantic data fixes, scoped typography utilities, first Playwright visual-regression suite |
| 2026-09-09 | Claude | Follow-up (same day, after user screenshot review): fixed VehicleShopSplit's left-edge misalignment (new `.inset-wide-l` utility) and restructured its vehicle-image positioning so ~1/3 of each vehicle overhangs below its panel without clipping or colliding with CategoryIconStrip |
| 2026-09-09 | Claude | Follow-up (same day, after another user screenshot): fixed CategoryIconStrip's hover ring rendering as broken arcs (overflow-hidden was clipping its own box-shadow ring) by moving image-clipping to a nested wrapper span |
| 2026-09-09 | Claude | Follow-up (same day, after user re-review): fixed the ring's default-state contrast (ring-line → ring-steel-300, was nearly invisible against its own background) and media-gated the hover color change behind `(hover: hover) and (pointer: fine)` so it can never get stuck on touch devices at any screen size |
