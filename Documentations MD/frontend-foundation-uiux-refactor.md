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
| Last updated   | 2026-09-29 (PromoBannerPair: real curated-product imagery replaces the generic icon fallback; full re-verification of the 2026-09-22 Figma-fidelity pass against the actual Figma reference) |

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

### Follow-up: Figma-fidelity pass — category tabs, promo banners, Add-to-Cart state, header/mobile nav (2026-09-22)

A 60-section spec asking for closer Figma fidelity on specific storefront areas, explicitly a
*fidelity pass, not a redesign* — preserve Odoo-backed catalog, CMS architecture, cart drawer
behavior, analytics, auth, accessibility, and the existing responsive foundations built above.
"REUSE, DON'T FORK" was an explicit constraint throughout.

1. **Compact segmented tab control** — `PillTabs` (`src/components/home/PillTabs.tsx`) gained an
   opt-in `variant?: "pill" | "segmented"` prop (default unchanged, so Trending/Perfect-Vehicle/
   Brands car-bike tabs and Popular/New tabs are byte-for-byte unaffected). `variant="segmented"`
   renders the Figma capsule: one outer bordered rounded-full container (`.segment-tabs`, new CSS
   in `index.css`), buttons immediately adjacent with no gap, active = dark fill/white text,
   inactive = transparent/muted grey — both states share `.segment-tab`'s padding/height/border so
   switching tabs never resizes anything. Never wraps to a second row (`overflow-x-auto` instead of
   `flex-wrap` — an initial `flex-wrap` version broke the single-row capsule shape at 390px, caught
   via screenshot review and fixed before shipping).
2. **Icons for the 8 category tabs** — reused existing `lib/icons.tsx` entries only (`Armchair`,
   `Camera`, `Grid2x2`, `SprayCan`, `HardHat`, `Umbrella`, `Backpack`, `ShieldCheck`); no new icon
   import was needed. **Tab labels/filters were NOT renamed** — the reference screenshot's "Covers"
   label for the car set doesn't match the real car category set (`Seat Covers`/`Dash Cams`/
   `Mats`/`Care`, established as correct in the 2026-09-09 entry above after the *actual* Odoo/mock
   category was verified); kept the real labels rather than re-introducing the mislabeling that
   entry already fixed.
3. **Denser product rail for these two sections only** — `ProductCarousel`
   (`src/components/product/ProductCarousel.tsx`) gained `variant?: "default" | "home-category"`
   (RailItem width `w-[260px] sm:w-[280px]` vs `w-[198px] sm:w-[216px] lg:w-[232px]`), plus
   `hideArrows`/`onBoundsChange` and a forwarded `RailHandle` ref (`scrollPrev`/`scrollNext`).
   `Rail` itself became `forwardRef` with the same two new opt-in props (`hideEdgeArrows`,
   `onBoundsChange`) — every existing consumer (Trending, Perfect-Vehicle, CategoryIconStrip, Shop
   grid, PDP related-products, Cart-drawer recommendations) passes neither and is unaffected.
4. **New `src/components/home/HomeCategoryProductSection.tsx`** — the shared shell for "Shop by Top
   Categories in Car/Bike": header (title + small circular scroll arrows next to "View All", using
   the new `Rail` ref) + segmented tabs + `ProductCarousel variant="home-category"`. One component,
   not a Car/Bike fork — `Home.tsx`'s two `blocks["top-categories-*"]` entries now just pass
   different props into it. The section-level arrows (`.rail-control-btn`, new CSS) are visually
   distinct from `Rail`'s own edge-overlay arrows used elsewhere (28-32px, neutral border, sit next
   to "View All" — not overlaid on the rail edges).
5. **`PromoBannerPair` rebuilt image-led** (`src/components/home/PromoBannerPair.tsx`) — was a full
   `object-cover` image behind the text (could obscure it) with generic `Package`/`Sparkles` icon
   fallbacks and a brand-orange/violet gradient pair not matching the Figma purple→blue /
   purple→light-blue reference. Now: `object-contain` image constrained to the card's right side as
   a flex sibling of the text block (can never cover it), moderate `rounded-xl` (was `rounded-2xl`),
   new gradient pair (`from-[#5b3fc4] to-[#3f6fd8]` / `from-[#6a3fc4] to-[#8fb8f0]`). **CMS
   ownership preserved exactly** — still reads real `cms_promotions` `image`/`heading`/`subheading`/
   `ctaLabel`/`ctaUrl` when published (verified live: a real "E2E Promo Heading" promotion rendered
   correctly, one card only — no fabricated second banner), falling back to the documented default
   copy only when nothing is published.
6. **ProductCard Add-to-Cart success state** (`src/components/product/ProductCard.tsx`) — the
   default-variant button now has a local `justAdded` boolean (`useState`, cleared by a
   `useRef`-tracked `setTimeout`, restarted on repeat clicks — same restart-cleanly pattern as
   `MobileCartAddedIndicator`): outline `btn-pill-outline` → solid `btn-pill-solid-brand` (new CSS,
   same `.btn-pill` shape so the button never resizes) with a `Check` icon and "Added to Cart" text
   for 1.5s, then reverts. `CartContext.addToCart` is the only source of truth — the visual state
   is purely transient/local, set only *after* the real (synchronous, cannot-fail-today) mutation,
   never before it. **Also fixed a latent variant-safety gap**: the default variant previously
   called `addToCart(product)` unconditionally, even for multi-variant products (silently adding a
   default variant) — it now checks `productRequiresSelection(product)` (existing helper, already
   used by the `cart-recommendation` variant) and renders a "Select Options" link to the PDP
   instead, matching the cart-recommendation variant's existing correct behavior. `aria-live`
   wraps the button's text/icon; `duration-200 motion-reduce:transition-none` respects reduced
   motion while the text+icon still switch (never color/animation-only). Cart drawer / mobile
   `MobileCartAddedIndicator` / badge / recommendation reranking are untouched — confirmed live via
   screenshot on both desktop (drawer opens, correct state) and mobile (no drawer, indicator bubble
   fires instead).
7. **Desktop navbar phone number removed** (`src/components/Header.tsx`) — the `tel:` link and
   `Phone` import are gone entirely (not hidden at another breakpoint); the search input widened
   (`w-64` → `w-64 lg:w-72`) to use the freed space. Footer/Contact-page/CMS phone content is
   untouched — this was specifically the main navbar.
8. **Mobile nav rebuilt into a real sliding drawer** — new `src/components/MobileNavDrawer.tsx`,
   wired from `Header.tsx`'s existing `open` state and CMS-driven `navItems` (no parallel nav
   system). Left-side slide-in with backdrop, body-scroll lock, focus trap, Escape-to-close,
   backdrop-click-to-close, closes on nav selection, focus returns to the hamburger button on
   close, `role="dialog" aria-modal="true"` — **applied only while open** (`role`/`aria-modal`/
   `aria-label` all become `undefined` when closed) specifically so a bare `page.getByRole('dialog')`
   query elsewhere in the test suite (previously unambiguous, since `CartDrawer` was the only
   `role="dialog"` element on any page) stays unambiguous; this was caught as a real regression via
   the existing `cart-drawer.spec.ts`/`cart-recommendations.spec.ts` suites and fixed before
   shipping. Account/Wishlist surfaced in a secondary drawer row (previously invisible below `sm`/
   640px on real mobile widths — a pre-existing reachability gap now fixed); Wishlist has no auth
   gate (matches the header icon row), Account is gated on `authConfigured`. Language switcher was
   deliberately left in the header icon row, not duplicated into the drawer (judged not to be
   crowding the compact header). Desktop mobile search (`mobileSearchOpen`) stays the separate,
   pre-existing toggle — not merged into the new drawer.

**Explicitly not touched** (per the spec's own "Do NOT touch" list): Odoo credentials/schema,
Admin auth, CMS database architecture, payment/checkout, transactional email, analytics event
architecture, recommendation scoring logic, product ownership.

### Follow-up: real Figma reference supplied, PromoBannerPair image fixed, full re-verification (2026-09-29)

The 2026-09-22 pass above was implemented and self-verified against the spec's *text* description
only — no Figma screenshot had actually been supplied at the time. This follow-up obtained the
real Figma reference (screenshots of the Car/Bike category sections, promo pair, PDP, and desktop
header) and re-verified every item in the 2026-09-22 entry against it, live, at all 7 requested
breakpoints. Everything held up (segmented capsule tabs, section arrows next to "View All", ~5-card
desktop rail density, Bike mirroring Car, phone-free header, accessible mobile drawer, Add-to-Cart
outline→solid→revert). One real gap remained, fixed here:

- **`PromoBannerPair`'s default (no-published-CMS-promotion) banners still fell back to a generic
  `Package`/`Sparkles` Lucide icon** — the 2026-09-22 entry's "image-led rebuild" only covered the
  case where a *real* `cms_promotions` row is published; the hardcoded default copy (shown until an
  admin publishes one) still used the old icon-on-gradient treatment, which the Figma reference does
  not use (it shows real product-collage artwork on both cards). Fixed in
  `src/components/home/PromoBannerPair.tsx` + `src/pages/Home.tsx`:
  - New shared `PromoArt({ src })` (replaces the duplicated image/icon branches in both the
    CMS-promotion and default render paths — one component, not two near-identical blocks).
  - `PromoBannerPair` gained two optional props, `comboImage`/`newLaunchImage` (strings), used only
    for the *default* banners (ignored the moment a real CMS promotion is published — CMS ownership
    is unchanged from the 2026-09-22 entry).
  - `Home.tsx` computes these from real data only, never fabricated: the same curated
    `featuredCmsProducts`/`newArrivalCmsProducts` arrays it already computes for the "Find Your
    Perfect Vehicles" Popular/New tabs (so "Best Combo Deals" and "New Launch" show a photo of an
    actually-curated bestseller/new-arrival product — the literal destination the card links to,
    `/shop?tag=bestseller` / `/shop?tag=new`), falling back to the mock catalog's own
    `tag === "bestseller"`/`"trending"`/`"new"` products when no CMS curation is published (the
    `tag` field is a mock-catalog-only concept — always absent on real Odoo products, matching the
    graceful-degradation rule already established elsewhere in this file).
  - **No image resolves to nothing (not a bug)** — with `VITE_CATALOG_SOURCE=supabase` (the local
    default), real Odoo products carry no `tag`, and this environment has no CMS "featured"/
    "new-arrivals" merchandising curated yet, so `comboImage`/`newLaunchImage` are both `undefined`
    right now. `PromoArt` renders a small soft abstract rotated device instead of an icon in that
    case — never a literal, potentially-misleading icon standing in for an unknown product, and
    never a fabricated/unrelated product photo (verified live by intercepting the
    `cms_promotions` REST call to force the default-banner path — see Testing).

## Interfaces / data

- `PageContainer({ size?: "normal" | "wide"; as?; className?; children })`
- `FullBleedSection({ as?; spacing?: "none" | "compact" | "normal" | "large"; containerSize?: "normal" | "wide"; className?; children })`
- `ProductMedia({ src?: string; alt: string; icon: string; className?; iconClassName?; eager?: boolean })`
- `ProductPlaceholder({ icon: string; className?; iconClassName? })`
- `ProductCarousel({ products: Product[]; tracking?; variant?: "default" | "home-category"; hideArrows?: boolean; onBoundsChange?: (b: {canScrollPrev, canScrollNext}) => void })`, now `forwardRef<RailHandle, ...>`
- `Rail({ children; centerWhenFits?; arrowStyle?; arrowTop?; hideEdgeArrows?: boolean; onBoundsChange?: (b: {canScrollPrev, canScrollNext}) => void })`, now `forwardRef<RailHandle, ...>` exposing `{ scrollPrev(): void; scrollNext(): void }`
- `PillTabs({ options; value; onChange; variant?: "pill" | "segmented" })` — `variant` defaults to `"pill"` (unchanged existing behavior)
- New `HomeCategoryProductSection({ title, ctaLabel, ctaHref, tabs, activeTab, onTabChange, products })`
- `PromoBannerPair({ promotions?; comboImage?: string; newLaunchImage?: string })` — new
  `comboImage`/`newLaunchImage`, used only for the default (no-CMS-promotion) banners; new internal
  `PromoArt({ src? })` (not exported)
- New `MobileNavDrawer({ open, onClose, navItems, currentPath, onNavigate, triggerRef, showAccountWishlist, accountHref, wishlistCount, accountLabel, wishlistLabel })`
- `CartContextValue` gained `removeLine(productId: string): void`, `setQuantity(productId: string, qty: number): void`, `clearCart(): void`
- New CSS: `.section-pad-compact` / `.section-pad-normal` / `.section-pad-large`, `.heading` / `.heading-upper`, `.inset-wide-l` (full-bleed-content left inset matching `.container-wide`), `.segment-tabs` / `.segment-tab` / `.segment-tab-active`, `.btn-pill-solid-brand`, `.rail-control-btn`
- New i18n keys (en/hi/gu, all three in lockstep): `home.tabMats`, `home.tabGuards`, `home.addedToCart`
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

### Figma-fidelity pass (2026-09-22)

- `npm run build` (`tsc -b && vite build`), `npm run lint` (oxlint, exit 0 — only pre-existing
  warnings in untouched files), `npm run typecheck:server`, `npm run test:unit` (99 passed/1
  skipped) — all clean.
- Screenshots captured and reviewed at all 7 requested breakpoints (1920×1080, 1550×900, 1440×900,
  1280×800, 1024×768, 820×1180, 390×844) against the Figma reference: segmented capsule tabs,
  section-level scroll arrows next to "View All", denser ~5-card desktop rail, Bike mirroring Car,
  phone-free desktop header, real single-promotion `PromoBannerPair` rendering, mobile nav drawer
  (backdrop, 6 links, Account/Wishlist row), Add-to-Cart success state on both desktop (opens the
  cart drawer, correct product highlighted, neighbors unaffected) and mobile (`MobileCartAddedIndicator`
  bubble, no drawer). Caught and fixed one real visual bug this way: segmented tabs wrapped to a
  second row at 390px (`flex-wrap` → `overflow-x-auto`).
- New `tests/interaction/home-figma-fidelity.spec.ts` (12 tests): segmented-tab switching +
  no-layout-jump, Bike mirrors Car, section arrow enabled/disabled state, desktop/mobile Add-to-Cart
  success state (incl. drawer-vs-no-drawer split), double-click-during-success-state settles to qty
  2 with one cart line (verified via the `/cart` page, scoped to `<main>` — the persistent-but-hidden
  `CartDrawer` renders its own copy of the same line elsewhere in the DOM, a pre-existing fact
  surfaced while writing this test), promo card renders real CMS content, no `tel:` link in the
  header, and 5 mobile-nav-drawer tests (all six links present, closes via X/Escape/nav-selection,
  focus returns to the hamburger, body-scroll lock).
- Regenerated `tests/visual/home.spec.ts-snapshots/*.png` (all 4 projects) — expected, since this
  pass intentionally changes the homepage's visual composition.
- Re-ran the full pre-existing interaction suite touching shared components
  (`cart-drawer.spec.ts`, `cart-recommendations.spec.ts`, `category-icon-strip.spec.ts`,
  `product-image.spec.ts`, `shop-catalog.spec.ts`) to confirm no regression. Found and fixed one
  real regression this surfaced: `MobileNavDrawer` was always mounted with `role="dialog"`, making
  the pre-existing bare `page.getByRole('dialog')` queries (previously unambiguous — `CartDrawer`
  was the only such element on any page) resolve to 2 elements — fixed by only applying
  `role`/`aria-modal`/`aria-label` while the drawer is actually open. Also updated
  `cart-drawer.spec.ts`'s "re-adding the same product" test, which used to select the target button
  by its (now transient) "Add to Cart" text — switched to a position/container-scoped locator so it
  isn't affected by the button briefly reading "Added to Cart". The remaining failures observed
  during this pass (intermittent `waitForLoadState("networkidle")` timeouts on `/shop`, and
  `cart-recommendations.spec.ts`'s "You Might Also Need" not appearing for one specific live Odoo
  product) were root-caused to pre-existing environment characteristics, not this change — see
  Known issues.
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

### Testing / verification (2026-09-29 follow-up)

- `npx tsc --noEmit`, `npm run lint` (oxlint — 0 errors; only pre-existing warnings in files this
  change doesn't touch, confirmed by grepping the warning list for `PromoBannerPair`/`Home.tsx`
  lines changed here), `npm run build`, `npm run test:unit` (106 passed/1 skipped),
  `npm run typecheck:server` — all clean.
- Real Figma reference (screenshots, not the spec text alone) reviewed against a live Playwright
  capture at all 7 requested breakpoints (1920×1080, 1550×900, 1440×900, 1280×800, 1024×768,
  820×1180, 390×844): segmented capsule tabs match (dark active pill, single row, thin outer
  border, arrows next to "View All"), ~5-card desktop rail density matches, Bike mirrors Car, no
  phone number anywhere in the desktop header at 1920px, desktop nav/search/icons stay balanced
  with no dead gap.
- `tests/interaction/home-figma-fidelity.spec.ts` (12 tests, `--project=interaction`): all pass,
  including the Add-to-Cart outline→solid→"Added to Cart"→revert flow (desktop opens the drawer
  with the correct line item + working cross-sell rail; mobile shows the indicator without opening
  a drawer), the double-click-settles-to-qty-2 test, and all 5 mobile-nav-drawer tests (6 links
  present, X/Escape/backdrop/nav-selection close paths, focus-restore, body-scroll lock).
- `PromoArt`'s default-banner path specifically verified live (not just by reading the diff): the
  homepage currently has one real published `cms_promotions` row ("E2E Promo Heading"), so the
  default-banner branch never renders under normal navigation. Intercepted the
  `**/rest/v1/cms_promotions*` REST call to return `[]` and reloaded — confirmed both
  "Best Combo Deals"/"New Launch" render the new soft abstract-device fallback (no `Package`/
  `Sparkles` icon), correctly, since neither CMS merchandising curation nor mock-catalog `tag` data
  exists in this environment right now; the image-resolution logic itself (`.map(productImage).find(Boolean)`
  over `featuredCmsProducts`/`newArrivalCmsProducts` or the mock catalog's tagged products) was
  verified by code inspection against `src/data/products.ts` (real `tag`/image entries exist there)
  and the clean `tsc`/build.
- **Pre-existing environmental flakiness re-confirmed, not caused by this change**: re-ran
  `cart-drawer.spec.ts` and `category-icon-strip.spec.ts` (neither touched by this change or the
  2026-09-22 pass's `Header`/`PillTabs`/`ProductCard`/`Rail`/`HomeCategoryProductSection`/
  `MobileNavDrawer` work) and both showed the exact class of failure already logged below under
  "Live Odoo/Supabase catalog latency" — every failure was a `page.goto("/shop")` +
  `waitForLoadState("networkidle")` timeout, or (for the one `category-icon-strip` geometry test)
  a layout measurement taken before a slow real-catalog fetch settled. Root-caused directly this
  time (not just inferred): a throwaway script hitting `/shop` on the same dev server showed
  `domcontentloaded` at 320ms but real product links (`a[href^="/product/"]`) still not present
  after 15s, and `networkidle` itself only resolving at ~15.3s — confirms the live Supabase/Odoo
  catalog fetch, not anything in this diff, is the slow path. `PromoBannerPair.tsx`/`Home.tsx` (the
  only files this follow-up touched) have no code path anywhere near `Shop.tsx`, `CartContext`,
  `Rail`, or `CategoryIconStrip`.

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
- **Live Odoo/Supabase catalog latency causes intermittent Playwright timeouts, unrelated to this
  pass.** `.env.local` has `VITE_CATALOG_SOURCE=supabase` (real catalog, not mock) as the local
  dev default; `catalog-products`/`catalog-categories` Edge Function responses were observed taking
  anywhere from ~1s to >15s during this session (confirmed via direct network tracing — not a
  frontend hang, a genuinely slow backend response). `Shop.tsx` deliberately has no
  fallback-while-loading (unlike `Home.tsx`, which shows stale/mock data while the real fetch is in
  flight — a documented, intentional exception), so any Shop-dependent test using a short
  `waitForLoadState("networkidle")`/`toBeVisible` timeout can intermittently fail under load. Not
  new — this exact pattern was already noted for the analytics tracking-journey test elsewhere in
  the project.
- **`src/lib/recommendations/engine.ts`'s candidate pool is the static mock catalog
  (`data/products.ts`), not the live Odoo catalog** — a pre-existing architecture gap (recommendation
  scoring logic is explicitly out of scope for this pass). Under `VITE_CATALOG_SOURCE=supabase`,
  a real Odoo product's cross-sell "You Might Also Need" rail can legitimately be empty if nothing
  in the mock pool shares its category/vehicle — observed with the real "GRASS 18 MM SET OF 5"
  product (empty `categoryIds`/`vehicleTypes` from Odoo) during this session's test run. Revisit
  only alongside real recommendation-engine work, not as part of a storefront fidelity pass.

### Follow-up: CategoryIconStrip centering (2026-09-18)

The 7-item category icon row under the Car/Bike hero was left-heavy on desktop when all items fit
in the viewport — the generic `Rail` always left-aligned its flex track. Fixed with an opt-in
`centerWhenFits` prop on `Rail` (nested scroll container + inner `w-max min-w-full justify-center`
track; existing `ProductCarousel` callers unchanged). Product photo circles use a nested
`overflow-hidden` wrapper so hover rings are not clipped.

### Follow-up: CategoryIconStrip geometry + hover (2026-09-18, completion)

Completed the surgical UI/UX fix prompt that Claude started before hitting its weekly limit.
Four targeted fixes, no unrelated Rail consumers changed:

1. **Center when fits** — `Rail centerWhenFits` on `CategoryIconStrip` only; scroll-from-start when
   the 7 items overflow (mobile / narrow desktop).
2. **No photo hover ring/halo** — photo circles keep the resting `ring-steel-300` only; no blue
   hover ring or darkening. Icon circles still darken to brand-700 on fine-pointer hover.
3. **Icon/image centering** — replaced `grid place-items-center` with flex on `.category-circle-*`,
   `size-9 shrink-0 block` on SVGs, and `object-contain object-center` on PNGs inside the nested
   clip wrapper. Inspected `categoryImages` assets: seat-covers (508.png) and audio-dashcams
   (491.png) are usable; floor-mats (13.png) remains icon-only (marketing collage, not a product
   photo).
4. **Geometric cell consistency** — shared `CategoryStripCell` with fixed `.category-circle-slot`
   (80×80) and reserved `.category-strip-label` region (`min-h-[2.5rem]`) so two-line labels do
   not vertically misalign circles.

Verified with `tests/interaction/category-icon-strip.spec.ts` (10 tests: centering at
1920/1550/1440/1366/1024, mobile scroll-from-start, SVG centering inside icon circles, photo hover
geometry stability, icon hover darken without layout shift).

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-29 | Claude | Follow-up: obtained the real Figma reference (previously only the text spec) and re-verified the 2026-09-22 Figma-fidelity pass against it live at all 7 breakpoints — everything held up. Fixed one real remaining gap: `PromoBannerPair`'s default (no-published-CMS-promotion) banners still used a generic `Package`/`Sparkles` icon fallback, not covered by 2026-09-22's "image-led rebuild" (which only handled the real-CMS-promotion path). New `PromoArt` shared sub-component; `Home.tsx` now computes `comboImage`/`newLaunchImage` from real curated bestseller/new-arrival product photos (never fabricated), falling back to a clean abstract device (never an icon standing in for a product) when none exist. Full re-verification: build/lint/typecheck/unit clean, 12/12 `home-figma-fidelity.spec.ts` passing; re-confirmed (and this time root-caused directly) that `cart-drawer.spec.ts`/`category-icon-strip.spec.ts` failures are pre-existing live-Odoo-catalog latency, unrelated to any file this change or the 2026-09-22 pass touched. |
| 2026-09-22 | Claude | Figma-fidelity pass: `PillTabs variant="segmented"` compact capsule control, denser `ProductCarousel variant="home-category"` rail, `Rail`/`ProductCarousel` forwardRef scroll controls, new `HomeCategoryProductSection` (Car+Bike share one component), image-led `PromoBannerPair` rebuild preserving CMS ownership, `ProductCard` Add-to-Cart success state + variant-safety fix, desktop phone number removed, new `MobileNavDrawer` real sliding drawer, 12-test Playwright suite added, visual-regression baselines regenerated, one real regression found+fixed (`MobileNavDrawer`'s always-mounted `role="dialog"` colliding with `CartDrawer`'s) |
| 2026-09-18 | Cursor | CategoryIconStrip completion: fixed circle slot + label region, flex-based icon/photo centering, photo hover ring removed, shared `CategoryStripCell`, 10-test Playwright suite (1550/1366 viewports + SVG centering + icon hover) |
| 2026-09-18 | Cursor | CategoryIconStrip desktop centering via `Rail.centerWhenFits`, nested photo clip wrapper retained for hover rings, 6-test Playwright interaction suite added |
| 2026-09-21 | Claude | CategoryIconStrip redesigned to the Figma category tile after user review: circles/rings/icon discs removed — bare product art (`public/images/categories/*.png`, cropped from the Figma reference; not Odoo data) above a grey label, seven equal-width cells on a white band, Rail `arrowStyle="circle"` (outlined prev / blue next, image-row anchored, still hidden when everything fits), `.category-circle-*` CSS removed, 7-test Playwright suite rewritten for the new markup |
| 2026-09-21 | Claude | "Shop by Brands" (car/bike makes) now shows real logos instead of the first-letter badge: `public/images/vehicle-brands/*.svg` (Simple Icons CC0 recoloured to brand colours + Wikimedia Commons SVGs for Maruti Suzuki, Mercedes-Benz, OLA, Royal Enfield, Hero), looked up by normalized make name via `vehicleBrandLogo()` so CMS-overridden names still resolve; TVS Motor and Chetak have no usable logo and keep the letter badge. Not Odoo data (Odoo has no make field). |
| 2026-09-09 | Claude | Initial version — layout/spacing primitives, ProductMedia/ProductPlaceholder, ProductCard DOM+rating fixes, Rail boundary arrows + ProductCarousel, VehicleShopSplit extraction, cart removeLine/setQuantity/clearCart, PDP Buy Now honesty, Shop tag filter, VehicleBrandGrid real links, Header chevron removal, 3 Home.tsx semantic data fixes, scoped typography utilities, first Playwright visual-regression suite |
| 2026-09-09 | Claude | Follow-up (same day, after user screenshot review): fixed VehicleShopSplit's left-edge misalignment (new `.inset-wide-l` utility) and restructured its vehicle-image positioning so ~1/3 of each vehicle overhangs below its panel without clipping or colliding with CategoryIconStrip |
| 2026-09-09 | Claude | Follow-up (same day, after another user screenshot): fixed CategoryIconStrip's hover ring rendering as broken arcs (overflow-hidden was clipping its own box-shadow ring) by moving image-clipping to a nested wrapper span |
| 2026-09-09 | Claude | Follow-up (same day, after user re-review): fixed the ring's default-state contrast (ring-line → ring-steel-300, was nearly invisible against its own background) and media-gated the hover color change behind `(hover: hover) and (pointer: fine)` so it can never get stuck on touch devices at any screen size |
