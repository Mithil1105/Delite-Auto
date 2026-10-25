# Frontend Foundation UI/UX Refactor

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Frontend foundation UI/UX refactor      |
| File           | `Documentations MD/frontend-foundation-uiux-refactor.md` |
| Branch         | figma                                   |
| Owner          | Claude (pairing with the user)          |
| Status         | Done — foundations fixed, Playwright visual regression tests added, VehicleShopSplit follow-up applied, Hero/Header reference redesign shipped, CMS silent-save bug fixed |
| Created        | 2026-09-09                              |
| Last updated   | 2026-10-19 (Shop by Cars car image enlarged; a tall/narrow desktop window no longer force-crops the hero to fill the screen height — it now sizes itself to the photo's own landscape ratio, with the next section reached by scrolling — see revision log) |

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
| 2026-10-13 | Claude | **Added "natural landscape" sizing for a tall/narrow desktop-width window — the opposite edge case from the ultra-wide one above.** User tested at 1398×2034 (DevTools "Responsive" mode) and shared a screenshot: the hero's forced `height: 100vh` made `object-fit: cover` crop drastically off the SIDES to fill that much height, cutting off the wordmark and tagline on both edges — proposed the fix themselves: "the hero image covers the normal height as it can be as a landscape image and then the shop by car section[s follow]." Added `MIN_HERO_ASPECT` (1.2 — comfortably below every previously-verified normal desktop ratio, the narrowest being 1280×720's 1.78, so no normal screen is affected). Below that ratio, `DesktopHero` drops the `height: 100vh` constraint entirely and sizes itself like `MobileHero` already does: full width, height = `width / (NATURAL_W/NATURAL_H)` (the photo's own ratio, so nothing is cropped — only one `<img>` renders, since there's no gap left for the ultra-wide blurred backdrop to fill), with the next homepage section (Shop by Cars/Bikes) reached by scrolling, exactly as the user described. The `naturalMode` decision reads `window.innerWidth/innerHeight` directly rather than the outer container's own measured rect, since that rect's height is itself conditional on the decision being made (would be circular otherwise). Verified live: at 1398×2034 the hero is now 755px tall (matches the photo's `1372:741` ratio exactly, both wordmark and tagline fully visible, "Shop by Cars" starts right at its bottom edge); confirmed unchanged (still exactly `100vh`) at 1920×950. `tsc`/build clean; unit 160 passed/1 skipped/3 pre-existing-unrelated. |
| 2026-10-13 | Claude | **Follow-up: the nav row now caps to the hero's own capped width on an ultra-wide screen, instead of spanning into its blurred margins.** User tested at 3840×1440 (via DevTools responsive mode) and flagged it with a screenshot: "we kept these blur bars but i want the nav bar to stay end to end with the image and not the blur part" — the nav row deliberately spans full browser width edge-to-edge (an explicit, separate requirement from 2026-10-07), but the hero photo below it is now capped+blurred on ultra-wide screens (the two prior entries), so the nav visibly extended past the crisp photo into its blurred side margins, looking disconnected. Extracted `MAX_HERO_ASPECT` (previously a local constant in Hero.tsx) into a new shared module, `src/lib/layout/heroWidthCap.ts`, alongside a `HERO_WIDTH_CAP_CSS` helper (`min(100%, 220vh)` — pure CSS, no JS/ResizeObserver needed) expressing the identical cap. Header.tsx's nav row wrapper now has `style={{ maxWidth: HERO_WIDTH_CAP_CSS }}` plus `mx-auto` on top of its existing `w-full` edge-to-edge classes — a no-op at any normal-to-large screen size (where 100% is always the smaller side of the `min()`, so nothing changes from before), and centers+caps the nav to line up exactly with Hero's own capped photo width once a screen is wide enough to trigger either cap. Applied to every page (not just the homepage) since Header has no per-page knowledge of whether a hero is present below it, and a width that's consistent across the whole site is simpler than conditioning this on the route. Verified live at 3840×1440: nav row's `x: 336→3504` now matches the hero's capped foreground box `x: 336→3504` exactly; confirmed unchanged (full 1920px width) at a normal 1920×950. `tsc`/build clean; unit 160 passed/1 skipped/3 pre-existing-unrelated. |
| 2026-10-13 | Claude | **Follow-up: the "Shop Now" button's glass effect now scales with screen size.** User reported (with a screenshot at a very large browser size) that beyond a certain size the button looked "weird," glass theme "not implemented properly" — still positioned correctly, just visually flat. Root cause: the button's box scales with the image (via `computeOverlayPx`'s `scale` factor, intentional — it has to stay sized to cover the baked button art underneath it), but the three CSS values that create the "glass" look — `backdrop-blur-md` (fixed 12px), the border width (fixed 1px), and the inset top highlight (fixed 1px) — are all FIXED pixel amounts from Tailwind classes, tuned for a normal desktop's button size. On a large/high-res screen (this isn't limited to ultra-wide aspect ratios — the prior entry's `MAX_HERO_ASPECT` cap only bounds width relative to height, not overall size), `scale` runs well past normal, the button renders much bigger, and those fixed amounts become proportionally tiny — reproduced in an isolated harness: at `scale≈2.1` (matching the user's reported window), the "before" button showed a barely-visible border and a hazy, inconsistent blur with no clear edge; a visibly different "flat"/"wrong" result from the normal-desktop version, confirming the bug. Added `glassStyleForScale(scale)`: blur, border width, and highlight all scale with the SAME `scale` `computeOverlayPx` already uses for the button's box, clamped (blur ≤28px, border/highlight ≤2.5px) so it never gets smudgy at extreme sizes. Applied only to the default (baked) image's button, since the custom-image button is sized by fixed CSS padding, not by this scale factor, so it was never affected. Verified side-by-side in the isolated harness: "after" shows a clean, clearly-bordered glass pill with a visible top highlight at the same `scale≈2.1` where "before" looked hazy/flat. `tsc`/build clean; unit 160 passed/1 skipped/3 pre-existing-unrelated. |
| 2026-10-13 | Claude | **Fixed the hero photo over-zooming on ultra-wide monitors.** User reported that on "a very big screen which is horizontally longer than normal desktop," the hero image looked stretched/wrong. Root cause: the hero fills exactly one viewport HEIGHT (an earlier, separate requirement), so `object-fit: cover` has to scale the photo up far more on a screen much wider than it is tall (21:9/32:9 ultra-wide) than it does at a normal ~16:9 ratio just to cover the extra width — `cover` never distorts proportions, but the much higher zoom reads as "stretched" to the eye. Presented the user two options (asked, didn't assume): a hard max-width with flat brand-color bars, or a blurred/zoomed backdrop fill — user picked the blurred backdrop. Added `MAX_HERO_ASPECT` (2.2): `DesktopHero`'s crisp foreground image is now capped to `width = min(containerWidth, containerHeight × MAX_HERO_ASPECT)`, centered, with a second, blurred/scaled copy of the same image (`blur-3xl scale-110` + a `bg-brand-700/35` tint) filling the full container behind it — an immersive edge-to-edge look instead of either an over-zoomed photo or empty bars. `computeOverlayPx` for the default image's button is fed the CAPPED box's own size (not the raw container), so the button still tracks the baked artwork exactly; a normal desktop (ratio ≤2.2, which covers every common 16:9/16:10 size) renders byte-for-byte identical to before — verified the foreground box width exactly equals the full container width at 1920×950 (no change), and is correctly capped to 2200px (centered, ~620px blurred backdrop each side) at 3440×1000 and ~3168px at a realistic 3440×1440 ultra-wide. While testing, found a separate, pre-existing, unrelated quirk worth flagging: the site's live CMS draft currently has an admin-uploaded custom hero image with a manually-set button position (92% from top) that sits close enough to the baked tagline to visibly overlap it at wide-but-short aspect ratios — this is inherent to the custom-image button position being a simple percentage (not tied to crop math the way the default image's `computeOverlayPx` is) and isn't something this fix touches; flagged to the user as optional follow-up, not blocking. `tsc`/build clean; unit 160 passed/1 skipped/3 pre-existing-unrelated. |
| 2026-10-11 | Claude | **Follow-up: fixed ugly letterbox bars the previous "preserve aspect ratio" pass introduced — switched to the same admin-adjustable focal point/zoom model Promotions already uses.** User reported the fix below with a live screenshot showing solid navy bars down both sides of a replacement hero image at a wide desktop viewport. Root cause: `object-fit: contain` (added to avoid cropping) only avoids bars when the container's aspect ratio happens to match the photo's — otherwise it pillarboxes/letterboxes, which is exactly what showed up (a 1672×941 photo in a ~1920×966 container). That approach was the wrong fix for the underlying need ("don't crop unpredictably") — this codebase had already solved that exact problem for Promotions banners with `ImagePositionControl`/`imagePositionStyle` (`src/lib/media/imagePosition.ts`): always `object-fit: cover` (full-bleed, no bars, matching the rest of the site) with an admin-settable focal point (X/Y) + zoom, per device, so the ADMIN chooses what gets cropped instead of the browser picking blindly or the photo getting boxed in. Removed `computeContainBox`/`useNaturalImageSize` entirely; `HeroContentOverride` gained `imagePosition?: ImagePositionByDevice`; `DesktopHero`/`MobileHero` now render a custom image with `imagePositionStyle(resolveImagePosition(imagePosition, device))`; `src/admin/pages/website/Hero.tsx` renders the same `ImagePositionControl` Promotions uses, right below the image picker. `buttonPosition` simplified back to a plain % of the container (no longer needs letterbox-offset math, since the image always fills the container now). Verified live via Playwright at 2559×1300 against the actual CMS draft the user had published (a re-uploaded copy of the original "Delitefied SUV" artwork) — bars gone, full-bleed on both desktop and mobile, confirmed `object-fit: cover` in the computed style. `tsc`/build clean; unit 160 passed/1 skipped/3 pre-existing-unrelated. |
| 2026-10-11 | Claude | **Follow-up: a replacement hero image is no longer force-cropped — it keeps its own true aspect ratio everywhere.** User: "i need it to maintain the original ratio of image in admin editor everywhere for every image to make the previewing easier." Previously a custom image was squeezed into the default photo's fixed box (`object-cover`, cropping whatever didn't fit) on both desktop and mobile — meaning the admin editor's preview didn't honestly show the full photo while positioning the button. Added `useNaturalImageSize()` (loads the image once to read its real `naturalWidth`/`naturalHeight`) and `computeContainBox()` (the `object-fit: contain` counterpart to the existing `computeOverlayPx()`'s cover math — same idea, no crop, centers with empty space on the shorter axis). **Desktop** still has to fill exactly one viewport (a separate, earlier hard requirement), so a custom image is now letterboxed (`object-contain`) inside that fixed-height box instead of cropped — the hero section's own background fills any gap, and the button's pixel position is computed from `computeContainBox` so it tracks the actual visible photo, not the box. **Mobile** has no such viewport constraint, so its container's own `aspect-ratio` CSS is simply set to the custom photo's real ratio once loaded (falls back to the default image's ratio for the one frame before it loads) — no letterbox math needed there at all, since container shape now equals image shape exactly. `buttonPosition` (added in the prior pass) now means % of the photo's own content box in both cases, not the surrounding container, so a slider setting means the same thing regardless of letterboxing. Since the admin editor's live preview renders the exact same `Hero` component as the public site, this fix is automatically WYSIWYG — no separate "admin-only" preview code needed. `tsc`/build clean; unit 160 passed/1 skipped/3 pre-existing-unrelated. |
| 2026-10-11 | Claude | **Follow-up: made the "Shop Now" button's position on a replacement hero image admin-adjustable.** The prior pass (below) fell back to one fixed generic button spot for every custom image, which the user correctly flagged as not good enough — different uploaded photos need the button in different places. Added `buttonPosition?: { left: number; top: number }` (percentages) to `HeroContentOverride`; `Hero.tsx`'s new `customButtonStyle()` positions the button there (via `left/top` % + `translate(-50%, -50%)` centering) when set, defaulting to the same centered-bottom spot (50%, 86%) otherwise. `src/admin/pages/website/Hero.tsx` gained two range sliders (Horizontal/Vertical %, only shown once an image is chosen) plus a "Reset to default position" link, bound through the existing `update()`/live `PreviewFrame` + `HeroPreview` already in that editor — so the admin sees the button move in real time against their own photo instead of guessing coordinates blind. Picking a new image (or removing it) clears any previously-saved `buttonPosition`, since a position tuned for one photo is meaningless on another. `tsc`/build clean. |
| 2026-10-11 | Claude | **Admin Hero editor can now replace the default hero image.** User asked for an image-swap option in the Hero admin editor, not just text/CTA. `HeroContentOverride` (`src/components/Hero.tsx`) gained `imageStoragePath?: string` — a `marketing-media` Storage path, same convention as `Promotions`/Category CMS fields — resolved via the existing public-safe `mediaPublicUrl()` (`src/services/cms/publishedCmsService.ts`) instead of the admin-only `AdminMediaPicker` copy, to avoid pulling admin-only code into the public storefront bundle. `src/admin/pages/website/Hero.tsx` now renders an `AdminMediaField` (the same Browse/Upload/Select picker over `cms_media`/bucket `marketing-media` used by Promotions) above the CTA-link input, replacing the old "image is a fixed design asset" copy with a narrower claim (only the baked headline/button artwork on the *default* photo is fixed). **Real constraint handled, not papered over**: the default image's "Shop Now" button position (`BUTTON_PX`/`computeOverlayPx`) is pixel-measured to exactly cover that specific photo's own baked button art — meaningless for an arbitrary admin-uploaded photo with no baked button at all. `DesktopHero`/`MobileHero` now take an `isCustomImage` flag; a custom image skips the pixel-cover math entirely and places the button at a fixed generic centered-bottom position (`GENERIC_BUTTON_STYLE`) with ordinary padding instead of a measured box. `tsc`/build clean; unit 160 passed/1 skipped/3 pre-existing-unrelated (same `odooCheckoutHandoff.test.ts` env-var gap as every prior run). |
| 2026-10-11 | Claude | **Fixed the actual architectural reason transparent-over-hero showed nothing at scroll=0: the header and hero section never geometrically overlapped.** User pushed back on a screenshot ("does this look transparent to you?") after the prior `scrollY===0` fix — the nav row really was computing `background-color: rgba(0,0,0,0)` (confirmed, not a lie), but root-caused via `document.elementsFromPoint()` at a point inside the nav row that the hero's `<img>` wasn't even in the hit-test stack there at all. Reason: `position: sticky` behaves exactly like `position: static` (no overlap with the next sibling) until the page has actually scrolled past the sticky element's natural position — so at scroll=0, Header (ending at y≈95) and Hero (starting right after, at y≈95) were simply adjacent, not stacked. The "transparent" nav was showing the plain page background the entire time, which happened to look pale enough to pass for sky at a glance — not a lie, but not actually revealing the hero photo either. Fixed by giving the hero `<section>` `margin-top: calc(-1 * var(--header-height))` on desktop (pulls it up to start at y=0, genuinely extending behind where the header sits) and changing `DesktopHero`'s own height from `100vh - header height` to a plain `100vh` to compensate, so the section still ends at exactly one viewport height. Verified live: `elementsFromPoint` now includes the hero's `<img>` at a nav-row point, and a screenshot shows the actual tip of the "Delitefied" wordmark poking up into the nav row at scroll=0 — genuine image content, not a coincidental color match — then cleanly cut off by solid white after a 1px scroll. `tsc`/build clean; unit 160 passed/1 skipped/3 pre-existing-unrelated. |
| 2026-10-11 | Claude | **Refined transparent-over-hero to top-of-page-only + hero image width-cropped tighter.** Two follow-ups, same session as the `IntersectionObserver` fix above. (1) User corrected the behavior itself: "even if the scrolling is through the hero image the background will turn white" — not "stays transparent for as long as the hero is still visible" (what the `rect.bottom > headerHeight` check actually did). Simplified `Header.tsx`'s `overHero` check to `window.scrollY === 0` — transparent only at the exact top of the page, white the instant any scroll happens at all, even 1px still well within the hero. Verified live (real scroll, 1 tick) that the hero is still fully visible (wordmark/car/button all on screen) while the nav is already solid white. (2) "Crop the image width a bit so it touches the top of the screen in normal desktop view": trimmed 150px off each side of `delitefied-suv-golden-hour-cropped.png` (1672×741 → 1372×741) — a narrower image is proportionally taller, so `object-cover`/`object-bottom` crops more consistently at normal desktop container ratios instead of leaving the original crop's full sky margin untouched. `Hero.tsx`'s `NATURAL_W` and the button overlay's `left` pixel coordinate (shifted by the 150px trim; `top`/`width`/`height` unaffected by a symmetric side crop) updated to match, for both the desktop JS-computed overlay and the mobile static-percentage one. Verified live at 1280/1440/1920px: hero still fills exactly one screen at every size, button overlay still aligns precisely over the drawn pill. `tsc`/build clean. |
| 2026-10-11 | Claude | **Fixed a real transparent-over-hero reliability bug: `IntersectionObserver` was silently failing to deliver callbacks.** User reported the nav bar stayed white permanently after any scroll, never returning to transparent even scrolled back to the very top of the homepage — and pushed back hard on an initial (wrong) assumption this was a browser-extension/cache issue, since their own screenshots (including a clean InPrivate window) showed the bug. Root-caused by directly instrumenting the live page via a connected browser session (not assumed): a *completely bare, vanilla* `new IntersectionObserver(cb, {threshold:0}).observe(el)`, with no custom logic at all, delivered **zero callbacks** — not even the one the spec guarantees fires immediately after `observe()` is called. Once the one callback that happened to fire earlier in the session set `overHero` to `false`, nothing could ever flip it back, since the observer was never calling back again. Fixed by replacing `Header.tsx`'s `IntersectionObserver` with a plain `scroll`/`resize` event listener that checks `heroEl.getBoundingClientRect().bottom > headerHeight` on every tick — a synchronous geometry read tied directly to the real scroll event, with no async browser API in the critical path to fail silently. Verified the exact previously-broken cycle (scroll down → white, scroll back to top → transparent again) via **real mouse-wheel scroll events** in a connected, non-headless browser (not `window.scrollTo()`, which was separately found to not reliably dispatch `scroll` events in this automated context and briefly produced a false negative while debugging) — recovered correctly on every repeat. `tsc` (frontend+server)/lint/build clean; unit 160 passed/1 skipped/3 pre-existing-unrelated. |
| 2026-10-11 | Claude | **Real PNG logo + edge-to-edge nav bar.** User supplied the actual "Delite" cursive-wordmark logo artwork (solid white background baked in, no transparency) to replace the placeholder blue pill badge in `Header.tsx`/`MobileNavDrawer.tsx` — doc comments in both files had already flagged this exact pill as a placeholder pending the real asset. Removed the white background via a difference-matting pass (headless-Chromium canvas: `alpha = 255 - min(r,g,b)`, then un-blend the white matte from the remaining color so anti-aliased edges stay smooth, not jagged) so the logo reads cleanly on both the white nav and the transparent-over-hero state; cropped tight to the wordmark's real content bounding box (it had ~140px of empty canvas above/below it) — `public/images/brand/delite-logo.png`, 215×94. Separately, explicit instruction: the nav row's content was capped to `.container-page`'s 1280px max-width, leaving large empty margins on both sides at common desktop/wide-monitor widths — changed Header's nav row wrapper to `w-full px-5 sm:px-6 lg:px-8` (no max-width), so it spans the full browser width edge-to-edge; `.container-page` itself was left untouched (used by every other page, out of scope). `tsc`/lint/build clean; verified live at 1920px (edge-to-edge, both the transparent-over-hero and white-scrolled nav states) and in the mobile drawer. |
| 2026-10-11 | Claude | **Real solid/glass "Shop Accessories" button + desktop hero fills exactly one screen (no scroll, nothing below visible).** User tested the 2026-10-10 crop live and reported two more real problems: (1) "Shop By Cars/Bikes" was still visible at the bottom of a normal desktop viewport without scrolling — the 1366×650 edge case accepted in the prior pass as "acceptable" was, in the user's actual words, not acceptable ("I just want the hero image to be seen on one page... I don't want to see what's below it"). Fixed properly this time: `Header.tsx` now publishes its own real rendered height as a `--header-height` CSS custom property via a `ResizeObserver` (not a one-time measurement — the CMS-driven AnnouncementBar can change it); `Hero.tsx`'s desktop (`lg:`+) layout sizes itself to exactly `calc(100vh - var(--header-height))`, so header+hero always fill precisely one screen at any viewport size, confirmed via the hero's actual `getBoundingClientRect().bottom` matching `window.innerHeight` exactly across four tested sizes (1440×800, 1920×950, 1366×650, 1280×720) — not just "looks right" in a screenshot. The image fills that box with `object-cover object-bottom` (cropping sides on short-wide viewports, top on tall-narrow ones, always keeping the button visible); since the crop amount now varies continuously with the live viewport instead of being fixed like the old aspect-ratio-locked layout, the button overlay's position is computed in JS (`computeOverlayPx`, replicating `object-fit: cover`'s own crop math) via a `ResizeObserver` on the image container, not a static CSS percentage. Mobile/tablet (below `lg:`) keeps the simpler fixed-aspect-ratio layout — scrolling for the button is normal, expected mobile UX, not the thing being complained about. (2) The "Shop Accessories" button needed to be a REAL, visible, solid-colored pill (explicit: "cover that shop now on the image and put an actual button... keep it solid purple... nothing gradient"), not the previous invisible hit-area over the baked artwork — now a real `<Link>` rendered with its own fill, fully covering the original drawn button. **Found and fixed a real measurement bug while building this**: the button's pixel bounding box (used by both the new JS math and the old static overlay) had been contaminated by the inline "Delitefied" word inside the tagline text just above the button — same purple-pixel family, so a simple "any purple pixel" scan merged both bounding boxes together, pushing the detected button top ~45px too high; the enlarged ("a little bigger") overlay from the 2026-10-10 pass was consequently overlapping/clipping the baked subtext line above it, confirmed live. Re-measured with a contiguous-run-length scan (requires a continuous horizontal stretch of matching pixels — only the solid pill sustains one; cursive letterforms don't) restricted to the image's bottom third, isolating the real button cleanly (665,642,342×64 vs. the earlier contaminated 664,599,343×113). Color later changed again mid-session to an explicit user hex (`#10148F`), rendered translucent (`rgba(…, 0.55)`) with `backdrop-blur-md` and a soft white top border for a glass effect (also explicit), replacing an earlier solid-opaque fill sampled from the image's own button pixel. `tsc` (frontend+server)/lint/build clean; verified live via the same four-viewport-size check plus visual screenshots at 1440×800 (desktop) and 390×844 (mobile). |
| 2026-10-10 | Claude | **Follow-up: cropped the hero image's excess top sky so the whole banner fits one desktop screen.** User tested the pass below live and reported two real problems with a screenshot: (1) the header *was* transparent over the hero correctly, but they couldn't tell — their browser tab had a stale pre-fix module in memory from before the `rootMargin` fix, confirmed by re-running the exact same scroll-offset check live against their own `localhost` port in a fresh headless session and getting the correct transparent→white transition every time; resolved by a hard refresh, no code change needed. (2) A real, correctly-identified problem: the hero+header combined were taller than a normal desktop viewport, pushing the "Shop Accessories" button below the fold — caused by ~268px of near-empty sky above the "Delitefied" wordmark in the source photo (confirmed by a pixel scan of the wordmark's own bounding box, not eyeballed), which at full-bleed width made the 941px-tall image render taller than most browsers' usable viewport height. Fixed by cropping the source image itself (a real file, via a headless-Chromium canvas crop, not a CSS trick): removed the top 200px, leaving a 68px margin above the wordmark — new file `delitefied-suv-golden-hour-cropped.png` (1672×741, replacing the 1672×941 original as Hero.tsx's image source). The button overlay's absolute pixel coordinates don't move when only the top is cropped, so they were re-expressed as percentages of the new, shorter image (`top`/`height` recalculated; `left`/`width` unchanged since the crop was vertical-only). Verified live at three representative viewport heights (1440×800 "normal desktop", 1920×950 "large desktop" — both show the full hero including the button with zero scrolling; 1366×650 "aggressively small laptop" still needs a small scroll, judged an acceptable edge case rather than cropping further and risking a cramped composition) — confirmed via the button's actual `getBoundingClientRect()` against `window.innerHeight`, not just a screenshot. `tsc`/build clean. |
| 2026-10-10 | Claude | **Hero swapped to a static image banner + Header transparent-over-hero/white-on-scroll** (explicit instruction: stop auditing the CMS-driven text hero — the "test heading" issue traced to the CMS silent-save bug fixed 2026-10-07 below — and move to one fixed creative instead, since that same static-banner architecture had already been built once in the interim for a different image, `banner-delitefy.png`; this pass just points it at the new "Delitefied SUV at Golden Hour" creative and finally adds the header behavior around it). `src/components/Hero.tsx`: swapped the image to `/images/hero/delitefied-suv-golden-hour.png` (1672×941) and re-measured the baked-in "SHOP ACCESSORIES" pill's real position — a headless Chromium canvas pixel scan (not eyeballed) found its solid-purple bounding box at x:664-1007/y:799-912 of the source file (center 50.0%/90.9%); the real overlay `<Link>` that covers it was sized ~18-20% bigger than that box around the same center, per explicit instruction ("a little bigger than what is shown in the image"), confirmed by temporarily outlining the live (normally invisible) overlay element and screenshotting it directly on top of the drawn button at both desktop and mobile widths. Added `id="home-hero"` to the hero `<section>` as an anchor for the new header behavior. `src/components/Header.tsx`: the nav row (not the `AnnouncementBar` strip above it, which stays solid blue throughout) now starts transparent on the homepage and switches to its normal white background once the hero scrolls out from under it, via an `IntersectionObserver` on `#home-hero` — chosen over a hardcoded pixel threshold since the hero's rendered height varies with viewport width (fixed-aspect-ratio image). **Found and fixed a real precision bug during verification**: a bare `threshold: 0` observer left a false-positive "still intersecting" sliver for the hero's last ~1px of scroll travel, confirmed live by scripting the exact scroll offset where the header stayed transparent well into the next section while every other offset worked — fixed with `rootMargin: -<header height>px 0 0 0` (measured via a new `headerRef`) so the switch now fires exactly once the hero is fully covered by the sticky header, verified clean across a spread of scroll offsets straddling the boundary. `tsc` (frontend+server), lint, build all clean; visually verified at 390px/1440px (top-of-page transparency, scroll-to-white transition, button-overlay alignment). |
| 2026-10-07 | Claude | **Hero/Header reference-image redesign + CMS admin-save silent-failure fix** (separate same-day pass, after the two category-strip passes below). (1) **Hero** (`src/components/Hero.tsx`) rebuilt to match a user-supplied reference screenshot: a large fixed "DELITEFY" wordmark behind one large vehicle photo (`car.png`, unchanged asset), replacing the prior dual car+bike composition; kept the existing navy/gold brand palette (a deliberate judgment call, not the reference's light theme) for consistency with the rest of the site. Per explicit user instruction, the wordmark is NOT CMS-editable but the heading/subheading/CTA text stays exactly as editable from Delite Admin as before (`HeroContentOverride` unchanged in shape apart from dropping the unused `eyebrow` field, which this new layout has no slot for — removed from the Admin Hero editor and the CMS-boundary test fixture too). `en.ts`/`hi.ts`/`gu.ts` hero copy updated to match the reference ("Everything Your Car Needs. Delitefy It." / "Shop Accessories"); hi/gu use the same English text with a documented placeholder comment (established project convention, not a real translation). (2) **Header** (`src/components/Header.tsx`) restructured per explicit spec: the Delite logo is now TRULY centered via `absolute left-1/2 -translate-x-1/2` (previously `mx-auto` only, which doesn't center against asymmetric flex siblings); desktop nav links are now `uppercase` (ALL CAPS); mobile top bar reflows to hamburger+search icon on the left, centered logo, wishlist+cart on the right (wishlist's `hidden sm:grid` removed — now always visible, not just desktop); Account and the language switcher are desktop-only (`lg:flex`) in the top bar and move into `MobileNavDrawer`'s bottom row below `lg`, alongside Account (own judgment call: the user's instruction was explicitly mobile-scoped, so desktop keeps them in the icon row since desktop has no drawer to hide them in). `MobileNavDrawer.tsx`'s bottom row changed from Account+Wishlist to Account+Language (wishlist moved to the always-visible top bar instead); `LanguageSwitcher.tsx` gained `className`/`buttonClassName`/`dropUp` props so the same component works both in the header's icon row and the drawer's bottom row (`dropUp` needed because the drawer-bottom trigger sits at the very bottom of the viewport — a downward-opening option list ran off-screen, caught via a live Playwright screenshot of the open drawer, not assumed). (3) **VehicleShopSplit mobile layout** (`src/components/home/VehicleShopSplit.tsx`): "Shop by Cars"/"Shop by Bikes" now sit side-by-side (`grid-cols-2`) at every breakpoint instead of stacking vertically below `lg:` — since each column is now roughly half the viewport width on a phone too (not just at `lg:`), the base/`sm:` text/image/padding scale was shrunk to its own smaller ramp; the `lg:` values are unchanged (already side-by-side there). (4) **CMS admin-save silent-failure bug** (`src/admin/services/cmsService.ts`, `src/admin/services/promotionsService.ts`): root-caused via direct Supabase inspection after the user reported "I can change stuff but it's not getting saved" — `cms_section_drafts`'s RLS write policy requires `admin_role` in `['owner','admin','content']`; a plain Supabase `.update().eq()` against a row the caller's role isn't allowed to touch returns ZERO rows affected with NO error (a classic RLS-with-plain-UPDATE gotcha), so `saveSectionDraft` was reporting "Draft saved" even when nothing was written — confirmed live: the Hero section's `draft_updated_at` was still Sept 21 despite a same-day save attempt. Fixed by adding `.select()` + a row-count check to every write in both files (`saveSectionDraft`, `reorderSections`, `updatePromotion`, `publishPromotion`, `deletePromotion`, `reorderPromotions`), turning a silently-ignored write into a real, surfaced "Save blocked — your admin role doesn't have permission to edit this content." error. (5) **Category strip image-load glitches**: Supabase edge-function logs showed real, intermittent `502`s from `catalog-media` under the burst of 10-20+ parallel cover-image requests a homepage load fires (Odoo occasionally failing a fraction of a concurrent burst) — added one automatic retry (300ms backoff) around `fetchOdooMediaBytes` in `supabase/functions/catalog-media/index.ts` (safe since that call is read-only; deliberately NOT added to the shared `odooExecuteKw`/`callJsonRpc`, which is also used by non-idempotent writes elsewhere), deployed and re-verified live (200 OK). (6) **The literal "fgfgh" heading**: turned out to be the Category Icon Strip homepage section's own `title` field (`cms_sections` section_key `category-strip`, NOT a category name — the previous entry below's "remains genuine stray test content" note was about this same field) — already had a working Admin field for it (`Admin → Website → Category Icon Strip` → "Section heading", `src/admin/components/SectionInspector.tsx`); its being unfixable traced back to the same silent-save bug in (4), not a missing UI. Updated both the draft and published `cms_section_drafts`/`cms_section_published` rows directly to "Shop by Categories" (no new CSS needed — inherits the same `heading text-2xl` class every other homepage section heading uses). Verified everything live: Playwright screenshots at 390/820/1440px (header, hero, drawer, language-switcher-open, category strip) plus a Supabase edge-function log check; `tsc` (frontend+server), lint, build all clean; unit suite 160 passed/1 skipped/3 pre-existing-and-unrelated failures (`odooCheckoutHandoff.test.ts`, missing `VITE_ODOO_CHECKOUT_BASE_URL` in the test env — untouched by this pass). |
| 2026-10-07 | Claude | **Follow-up/correction** to the same-day category-strip pass below, prompted by the user correctly pushing back: "can't u do that? according to the owner Odoo has the images for category and names too, i dont understand the issue." The earlier pass's "4N"/"fgfgh" content was wrongly written off as pure CMS garbage needing manual admin cleanup — the owner was right that Odoo has real category data. Investigated instead of deferring: confirmed `catalog-categories` never requested or exposed ANY Odoo category image (`id`/`name`/`parent_id` only) — a real, fixable code gap, not a content problem. First fix attempt assumed Odoo's standard `image.mixin` fields (`image_1920` etc.) — wrong for this instance; verified live via a new diagnostic (`category-image-diag`, `fields_get` + a real-data sample) before shipping, rather than assuming the guess was right: those fields are genuinely empty on every real category, while a separate `cover_image` field holds real images for all of them (confirmed id 25 "4N" → an actual, correctly-oriented "4N MATS" brand logo, downloaded and viewed, not just a non-404 status). Added `cover_image` to the media whitelist; `catalog-categories` now returns a real `imageUrl` per category; `Category`/`CatalogCategoryDto` gained `imageUrl`; `useResolvedCategorySelections` falls back to it when no CMS override image is set; `CategoryIconStrip` gained a per-tile `onError` fallback (a category genuinely without a `cover_image` still degrades to the generic icon, never a browser broken-image glyph) — this also means the earlier pass's `Icon name="Package"` fix now actually gets exercised correctly instead of masking a missing-image code gap. Verified live end-to-end: real Odoo category images (CAR/BIKE/4N/WURTH/DOLPHIN, up to several MB each, since `cover_image` is a non-resized website-category-page banner field, not a small icon field) now render in the actual homepage category strip. Full detail (including the field-name correction and the `category-image-diag` diagnostic, kept deployed): `odoo-real-catalog.md`. `tsc` (frontend+server), lint, build, unit (113 passed/1 skipped) clean; `get_advisors(security)` re-run, no new findings (Edge Function changes aren't covered by that tool regardless). |
| 2026-10-07 | Claude | User-reported bug pass on the category strip ("Shop by Cars/Bikes" → category icons): "UI glitches ... after ~23 seconds it becomes a question mark with an error." Reproduced live (dev server + browser, not guessed) and found three real, independent bugs, all fixed: **(1)** a genuine infinite-render loop in `src/components/Rail.tsx` — its bounds-tracking `useEffect` listed `children` as a dependency, and `children` is a new JSX reference on every parent render, so it tore down and recreated the `ResizeObserver` every render; `ResizeObserver.observe()` fires its own async notification the instant it's called, and separately `onBoundsChange` was invoked with a brand-new object literal every call (never `Object.is`-equal to the last one), so a consumer storing it in `useState` (`HomeCategoryProductSection`) got a guaranteed re-render on every single bounds check — together a continuous "Maximum update depth exceeded" loop confirmed firing on every single page load via a captured stack trace, not just this one section. Fixed by splitting the ResizeObserver's mount/unmount from the "recompute on content change" effect, and by only calling `onBoundsChange` when the booleans actually change (`lastReported` ref) — fixed at the `Rail` source, protecting every current and future consumer, not just the category strip. **(2)** The exact "becomes a question mark" symptom: `CategoryIconStrip`'s empty-image fallback renders `<Icon name="Package" />`, but `"Package"` was never imported into `src/lib/icons.tsx`'s icon map — `Icon` silently falls back to `CircleHelp` (a question-mark-in-a-circle) for any unrecognized name, which is exactly what rendered. Added the missing `Package` import/map entry. Explains the "after ~23 seconds" timing: the strip renders the hardcoded default images first (no network dependency), then swaps to the CMS-curated `cmsItems` once the slower Odoo-backed category-name resolution (`useResolvedCategorySelections` → `catalog-categories`) finishes — any curated category with no image set hit the broken fallback. **(3)** A real gray visual seam between `VehicleShopSplit` and the category strip at every breakpoint (mobile through desktop) — `VehicleShopSplit`'s section used `margin-bottom` to reserve clearance for its overhanging vehicle image, but a CSS margin is outside the element's own background box and shows the page's base `bg-paper` (`#f7f8f8`, not pure white) through the gap; switched to `padding-bottom` so the section's own white background fills the reserved space. Also hardened `useResolvedCategorySelections`'s Odoo category-name fetch (`src/hooks/useMerchandisingCms.ts`) with a `.catch()` — it had none, so a transient failure (a live `catalog-categories` 503 was directly observed during this pass, matching this project's documented history of intermittent Odoo flakiness) was an unhandled promise rejection rather than a graceful fallback to default items. **Separately flagged at the time as "not code-fixable" — partially WRONG, corrected the same day (see the entry above this one):** the missing category image was in fact a real code gap (`catalog-categories` never exposed any Odoo category image at all), not pure CMS garbage — the user correctly pushed back on this conclusion rather than accepting it, and the real fix is documented in the entry directly above. The Homepage "category-strip" section's own title still being literally `"fgfgh"` remains genuine stray test content an admin needs to fix via Delite Admin → Website → Homepage (code cannot invent a real heading). Verified via a live dev-server + browser session (console-error capture, injected stack-trace capture, and Playwright `chromium` screenshots at 390/768/1024/1440px before/after each fix — gray seam and question-mark confirmed gone, infinite loop confirmed stopped via a fresh console-message capture after each change). `tsc`/lint/build/unit (113 passed/1 skipped) all clean; no new lint warnings in any touched file. |
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
| 2026-10-19 | Claude | VehicleShopSplit: enlarged the Shop-by-Cars vehicle image (lg max-w 320→470px, max-h 215→290px, with proportional sm/base steps) at the user's request. Also replaced the BMW with a Hyundai Creta: public/images/hero/car.png is now a background-removed (local AI cut-out via @imgly/background-removal-node, interior holes filled) 1100px transparent PNG of a silver 2021 Hyundai Creta studio render, supplied by the user (hyundai_creta_2021_0001.webp, shows a "3D:SQUIR" number-plate watermark from the render vendor — confirm the image licence). Earlier Wikimedia CC BY-SA photos were tried and dropped (cropped rear / transparent windows / flat tyre), so no photo credit is needed. |
| 2026-10-19 | Claude | VehicleShopSplit: reduced the Shop-by-Cars car after the enlarged Creta overran the blue diagonal — lg max-w 470→360px / max-h 290→215px (sm 210/125, base 150/85), width 85% of the column and nudged left (left-[46%]) so it stays inside the diagonal. |
| 2026-10-19 | Claude | public/images/hero/car.png: removed the "3D:SQUIR" number plate from the Creta cut-out entirely (replaced the earlier blur) by rebuilding the plate area row-by-row from the surrounding grille/bumper pixels, baked into the PNG. |
| 2026-10-19 | Claude | public/images/hero/car.png: redid the Creta number-plate removal after the first fill smeared the bright bumper corner across the area — the plate region is now rebuilt in three bands (dark grille above the bumper bar, silver bar interpolated left→right, dark lower slats), baked into the PNG. |
| 2026-10-19 | Claude | public/images/hero/car.png: third pass on the Creta plate removal — tighter mask (no longer overwrites the silver bumper curve at the right) and the lower dark band now fades out instead of ending in a hard edge. An automatic patch-based inpaint was tried and rejected (jagged). Still hand-reconstructed; a proper editor/generative fill would give a better result. |
| 2026-10-19 | Claude | public/images/hero/car.png: replaced with a user-supplied plate-free version of the silver Creta render (the hand-reconstructed bumper fixes are dropped). Background removed locally, windows filled, 1100px transparent PNG. The source carries a small "AI-generated content" tag outside the car (removed with the background); the grille Hyundai badge is not present in this version. |
| 2026-10-21 | Claude | VehicleShopSplit: car bottom offset now matches the bike's at every breakpoint (-26/-40/-78px) so both vehicles' tyres sit on the same floor line (the car was 18–32px higher), and the car is slightly larger again (lg max-w 360→420px, max-h 215→255px; sm 240/148; base 170/98; width 92% of column). |
