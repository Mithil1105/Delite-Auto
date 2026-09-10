# Personalized Product Recommendations

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Shared recommendation engine (PDP + cart-drawer cross-sell) |
| File           | `Documentations MD/personalized-product-recommendations.md` |
| Branch         | figma                                   |
| Owner          | Claude (pairing with the user)          |
| Status         | Done (cart-cross-sell + pdp strategies; "personalized" Home strategy explicitly deferred) |
| Created        | 2026-09-10                              |
| Last updated   | 2026-09-10                              |

## Summary

A single rule-based recommendation engine (`src/lib/recommendations/engine.ts`) that scores and
ranks the catalog for a given context. Two strategies are wired up today: `"pdp"` (Product
Detail's "You might also like") and `"cart-cross-sell"` (the cart drawer's new "YOU MIGHT ALSO
NEED" rail, aggregated across the *entire* basket, not just the last item added). Recommendations
inside the cart drawer support "Quick Add" (adds straight to cart, stays in the drawer, re-ranks
immediately) with an explicit "Select Options" fallback for any product that would require a
variant/colour/fitment choice before it can be added.

## Why

The user wants the cart drawer to cross-sell contextually — "customer has a seat cover and floor
mats in the cart, so suggest neck rests / sun shades / dashcams, not more seat covers" — using the
*same* engine that will eventually power PDP and a future personalized Home surface, rather than
three separate ad-hoc algorithms. No recommendation engine, PDP-related-products replacement, or
customer-history tracking existed in this codebase before this change — the request describes the
desired architecture as though a PDP-side engine already existed; it didn't, so this pass builds
the whole thing (engine + both strategies) rather than only the cart-drawer half, so the "one
engine, not two" requirement is actually true rather than aspirational.

## Scope

**In scope:** the engine itself (`src/lib/recommendations/`), `useRecommendations` hook, the
`"cart-cross-sell"` strategy and its `CartRecommendations` rail inside the existing cart drawer,
re-pointing PDP's "You might also like" at the same engine via `"pdp"`, a `recordProductView`
history signal (localStorage-backed "recently viewed" categories — the only customer-history
signal that exists, since there's no real order data), a compact `cart-recommendation` variant of
the shared `ProductCard`, Quick Add / Select Options behavior, recommendation analytics event
stubs, and both a unit-test suite (Vitest, new to this repo) for the scoring logic and Playwright
interaction tests for the cart-drawer UI behavior.

**Explicitly not in scope:** a `"personalized"` Home strategy (mentioned only as a future
consumer in the architecture diagram), real co-purchase/co-cart data (no order history exists —
see "Known issues"), Odoo variant/fitment data, and anything to do with Shop/PDP layout, Hero, or
homepage spacing.

## Implementation notes

- File: `src/lib/recommendations/types.ts` — `RecommendationStrategy` ("pdp" | "cart-cross-sell"),
  `RecommendationSurface` ("product_detail" | "cart_drawer"), `RecommendationRequest`,
  `ScoredCandidate`. `RecommendationRequest.recentlyViewedCategories` is a deliberate
  dependency-injection seam: production callers omit it (the engine reads
  `getRecentlyViewedCategories()` itself), but `engine.test.ts` passes an explicit `Set` so the
  "recent affinity" signal is testable without a DOM/localStorage (Vitest here runs in a plain
  Node environment, no jsdom).
- File: `src/lib/recommendations/categoryGraph.ts` — a hand-authored
  `COMPLEMENTARY_CATEGORIES: Record<categorySlug, categorySlug[]>` map (e.g. `seat-covers` →
  `[comfort, fragrances, gps-security, audio-dashcams]`). This is the "what goes with what" signal
  until real co-purchase data exists. Deliberately asymmetric in places (e.g.
  `workshop-essentials` → `car-care` but not the reverse) — these are "customer with X in mind
  probably also wants Y" edges, not a symmetric same-cluster relation.
- File: `src/lib/recommendations/history.ts` — `recordProductView(productId)` (called from
  `ProductDetail.tsx` on every PDP visit) and `getRecentlyViewedCategories(limit)`, both
  localStorage-backed (`delite-auto-recently-viewed`, most-recent-first, capped at 20, wrapped in
  try/catch like the rest of the app's storage access). This is the *only* customer-history signal
  today — no purchase-history equivalent exists (no real order data).
- File: `src/lib/recommendations/analytics.ts` — `trackRecommendationEvent`, typed for
  `recommendation_impression` / `recommendation_click` / `recommendation_add_to_cart`, each
  carrying only `productId`/`strategy`/`surface`. No analytics backend is wired up; it
  `console.debug`s in dev. This is the seam a real provider plugs into later.
- File: `src/lib/recommendations/variants.ts` — `productRequiresSelection(product)`, reading a new
  optional `Product.requiresSelection` field (`src/data/types.ts`). No current catalog entry sets
  it (no real variant data exists yet — see
  `Documentations MD/figma-shop-product-odoo-integration.md`), but the check exists now so Quick
  Add can never silently guess a variant once fitment data lands.
- File: `src/lib/recommendations/engine.ts` — the scoring/ranking pipeline:
  - `scoreForCartCrossSell(candidate, cartLines, recentCategories)` — returns `null` (hard
    exclude) for: already in cart, `available === false`, or vehicle-incompatible (a `car`/`bike`
    candidate with no matching vehicle anywhere in the cart; `universal` always passes, and an
    all-`universal` cart doesn't constrain vehicle at all). Otherwise scores: **+35** per cart
    category the candidate complements (via `COMPLEMENTARY_CATEGORIES`), **+15** bonus if it
    complements 2+ distinct cart categories, **+35** if its vehicle matches the cart's, **+20** if
    its category is in the customer's recently-viewed categories, **−25** if its category is
    already represented in the cart (a real signal, not an exclusion — "don't just recommend more
    seat covers" without banning a genuinely-different seat-cover-adjacent item outright). No
    co-purchase/co-cart term exists (see "Known issues").
  - `scoreForPdp(candidate, currentProduct)` — excludes the product itself, unavailable items, and
    vehicle mismatches; scores **+35** complement, **+15** same category, **+10** same brand
    (replaces the old `relatedProducts`' plain "same category OR same brand" filter with the same
    engine, weighted).
  - Both filter to `score > 0` only — a strategy with nothing genuinely relevant returns fewer
    than the limit (or nothing) rather than padding with weak matches.
  - `rankAndDiversify(candidates, limit)` — sorts by score (stable, so ties keep catalog order),
    then caps any one category at 2 picks, only relaxing that cap if too few candidates remain to
    fill `limit`. `limit` is always clamped to `[2, 4]` regardless of what's requested.
  - `getRecommendations(request)` is the single public entry point both consumers call (via the
    hook below) — "one engine, different strategies," not two implementations.
- File: `src/hooks/useRecommendations.ts` — thin `useMemo` wrapper. Deliberately does **not**
  deep-compare or build a synthetic dependency key: `currentProduct` (from the static `products`
  array via `productBySlug`) and each cart line's `product` (from `CartContext`'s `lines` state)
  are already stable object references that only change on a genuine data change, never on an
  unrelated re-render — documented as the load-bearing invariant this hook relies on.
- File: `src/components/cart/CartRecommendations.tsx` — new. Reads `lines`/`addToCart` from
  `useCart()` itself (no props from `CartDrawer`), calls
  `useRecommendations({ strategy: "cart-cross-sell", cartLines: lines, limit: 4 })`, and renders
  nothing when the cart is empty or nothing scores above the relevance threshold. Fires
  `recommendation_impression` once per distinct rendered product-id set (effect keyed on the
  joined ids, not the array reference, so it doesn't refire on unrelated renders). Quick Add calls
  the *regular* `addToCart(product)` (default feedback), not a feedback-suppressed variant —
  intentional: the drawer is already open, so `addToCart`'s "open the drawer" side effect is a
  no-op (setting an already-`true` flag doesn't retrigger the CSS transition or React re-render),
  and the newly-added line still gets the existing highlight/scroll-into-view treatment from
  `CartDrawer`'s `recentCartActivity` effect — a nice side benefit, not something that had to be
  built new.
- File: `src/components/cart/CartDrawer.tsx` — `CartRecommendations` is mounted inside the
  scrollable body, after the cart-lines list, *before* `CartDrawerSummary` (which stays a sibling
  outside the scroll container, unchanged) — so subtotal/View Cart/Checkout are always visible
  without scrolling past recommendations, satisfying that requirement structurally rather than
  needing extra scroll-position logic.
- File: `src/components/product/ProductCard.tsx` — gained `variant?: "default" |
  "cart-recommendation"`, `onQuickAdd?`, `onView?`. The `cart-recommendation` branch is an early
  return with a compact single-row layout (44px thumbnail, name, price, and either a "Quick Add"
  button or — when `productRequiresSelection(product)` is true — a "Select Options" link to the
  PDP instead). No large description/colour-selector/full-width button, per spec. This is the
  *same* `ProductCard` component everywhere else in the app, not a parallel implementation.
- File: `src/pages/ProductDetail.tsx` — `related` now comes from
  `useRecommendations({ strategy: "pdp", currentProduct: product, limit: 4 })` instead of the old
  `relatedProducts(product)` (that function still exists in `src/data/products.ts` — still used by
  `mockCatalogService.getRelatedProducts` — just no longer called directly here). A new effect
  calls `recordProductView(product.id)` on every PDP mount/product change, feeding the
  cart-cross-sell "recent affinity" signal. Both the hook call and the effect run unconditionally
  *before* the `if (!product) return <Navigate ... />` early return (Rules of Hooks), guarded
  internally by `product` being possibly `undefined` instead.
- File: `src/i18n/{en,hi,gu}.ts` — new `cart.youMightAlsoNeed` / `cart.quickAdd` /
  `cart.selectOptions` keys, in lockstep across all three locales (enforced by `hi`/`gu` being
  typed as `Translations = typeof en`, so a missing key fails the build).
- File: `src/data/types.ts` — new optional `Product.requiresSelection?: boolean`.
- File: `vite.config.ts` — added a minimal Vitest `test.include` block (`defineConfig` now
  imported from `vitest/config`, which is Vite's `defineConfig` merged with Vitest's config
  typing — needed so the `test` key type-checks under `tsc -b`, which includes `vite.config.ts` via
  `tsconfig.node.json`). This doesn't affect `vite build`/`vite dev` at all — Vitest is a separate
  CLI (`vitest`/`npm run test:unit`) that happens to reuse the same config file.
- File: `package.json` — added `vitest` devDependency (new to this repo — the only prior test
  tooling was Playwright, which is suited to DOM/interaction behavior, not unit-testing a pure
  scoring function) and a `test:unit` script.

## Interfaces / data

- `RecommendationStrategy = "pdp" | "cart-cross-sell"`, `RecommendationSurface = "product_detail" |
  "cart_drawer"`
- `getRecommendations(request: RecommendationRequest): Product[]` — `src/lib/recommendations/engine.ts`
- `useRecommendations({ strategy, currentProduct?, cartLines?, limit? }): Product[]` —
  `src/hooks/useRecommendations.ts`
- `trackRecommendationEvent(event: RecommendationAnalyticsEvent)` —
  `src/lib/recommendations/analytics.ts`
- `recordProductView(productId: string)`, `getRecentlyViewedCategories(limit?): Set<string>` —
  `src/lib/recommendations/history.ts`
- `productRequiresSelection(product: Product): boolean` — `src/lib/recommendations/variants.ts`
- `Product.requiresSelection?: boolean` — `src/data/types.ts`
- `ProductCard` gained `variant?: "default" | "cart-recommendation"`, `onQuickAdd?: () => void`,
  `onView?: () => void` — `src/components/product/ProductCard.tsx`
- New i18n keys (en/hi/gu): `cart.youMightAlsoNeed`, `cart.quickAdd`, `cart.selectOptions`

## Dependencies

- New devDependency: `vitest` (unit tests for the scoring engine only — Playwright remains the
  DOM/interaction test tool, unaffected).
- Builds on the cart drawer from `Documentations MD/responsive-cart-drawer.md` (mounts inside it,
  reuses `CartContext`'s `lines`/`addToCart`) and the shared `ProductCard` from
  `Documentations MD/figma-shop-product-odoo-integration.md`.

## Testing / verification

- `npm run test:unit` (Vitest) — 11 tests in `src/lib/recommendations/engine.test.ts`, all
  passing, covering spec items A–D, F, H, I against real catalog data (not fixtures):
  - A: a product already in the cart is excluded from its own recommendations.
  - B: a bike-only product is excluded when the cart contains only car products (and vice versa
    isn't asserted directly but follows from the same exclusion rule).
  - G: an empty cart yields no cart-cross-sell recommendations.
  - C, D, H are asserted directly against `scoreForCartCrossSell`'s returned score (exported for
    testing) rather than against the final top-4 UI list — with 58 catalog products across a
    handful of complementary categories, many legitimate candidates tie on score, so *which* exact
    4 win the diversification cutoff is emergent catalog-density noise, not something a
    scoring-behavior test should assert on. C: a complementary-category candidate scores above a
    same-category-as-cart candidate. D: a candidate complementing two cart categories (seat-covers
    + floor-mats → comfort) scores above one complementing only one. H: injecting a recent-affinity
    category raises a candidate's score enough to overtake an otherwise-identical competitor.
  - F: `productRequiresSelection` returns `true` for a synthetic product flagged
    `requiresSelection: true` and `false` for existing catalog products.
  - I: `en.cart.youMightAlsoNeed` doesn't contain "frequently bought" — guards against claiming
    collaborative-filtering confidence the app doesn't have.
- `npx playwright test --project=interaction` (now 15 tests: the prior 12 cart-drawer tests
  unchanged/still passing, plus 3 new in `tests/interaction/cart-recommendations.spec.ts` covering
  spec items E and G at the UI level: the "YOU MIGHT ALSO NEED" rail appears above the sticky
  footer after adding a product; Quick Add adds the product to the cart line list, changes the
  subtotal, keeps the drawer open (`toBeVisible`, URL unchanged), and removes that product from
  the rail; removing the last cart line hides the rail along with the rest of the cart contents.
- `npx playwright test` (full suite, 19 tests) — all passing, including the pre-existing 4 visual
  and 12 interaction tests (no regression from this change).
- `npm run lint` — same 5 warnings as before this change (3 pre-existing `only-export-components`,
  2 pre-existing `set-state-in-effect` on `CartDrawer.tsx`/`MobileCartAddedIndicator.tsx`); no new
  warnings from any file this pass touched.
- `npm run build` — clean.
- Manually verified in a real browser (desktop 1440×900): added a seat cover from `/shop`, drawer
  opened showing the cart line, a "YOU MIGHT ALSO NEED" rail with 4 compact rows (comfort item,
  two audio-dashcams items, one gps-security item — matching the category-complement design),
  Quick Add buttons, and the sticky Subtotal/View Cart/Checkout footer still fully visible with no
  scrolling required. Screenshot reviewed for layout/spacing quality before considering the task
  done.

## Accessibility

- The recommendation rail lives inside the cart drawer's existing `role="dialog"` /
  `aria-modal="true"` region — see `Documentations MD/responsive-cart-drawer.md` for that dialog's
  own accessibility notes (focus trap, Escape, focus restore); nothing about that changed here.
- Each recommendation row's image and name are real `<Link>` elements (keyboard-reachable, inside
  the drawer's existing Tab focus trap); Quick Add and Select Options are a real `<button>`/`<a>`
  respectively, both with visible, readable label text (not icon-only).
- No new live region was added for recommendations — Quick Add's cart-count/subtotal changes are
  visually immediate and the product simply leaves the rail; this mirrors how the rest of the
  drawer (quantity stepper, remove) already behaves without its own `aria-live` announcement.

## Known issues / follow-ups

- **No co-purchase/co-cart data exists.** The spec's "co-purchased with a cart product: +50" and
  "co-carted with a cart product: +40" signals are intentionally *not* implemented — there's no
  real order/session history to derive them from, and fabricating one would misrepresent
  confidence the app doesn't have (this is also why the rail is labeled "You Might Also Need," not
  "Frequently Bought Together" — see test I). Once Odoo order history lands, these plug into
  `scoreForCartCrossSell` as additional positive terms without changing its exclusion logic.
- **"Recent affinity" is the only customer-history signal**, sourced from `localStorage`
  (`recordProductView`) rather than any backend session/purchase history, and is capped to the
  last 20 PDP views / most-recent 8 for scoring. It degrades silently (empty set) if storage is
  unavailable, same as `CartContext`'s existing persistence.
- **No product in the catalog sets `requiresSelection: true`** — real variant/fitment data doesn't
  exist yet (tracked in `Documentations MD/figma-shop-product-odoo-integration.md`), so the "Select
  Options" path is exercised by a unit test with a synthetic product, not by any real catalog item
  today. The mechanism exists precisely so a future variant rollout doesn't need to retrofit it
  under time pressure.
- **The `"personalized"` Home strategy from the architecture diagram is not implemented** — it was
  explicitly out of scope for this pass (see "Do not start other work" style instruction in the
  originating request).
- **Recommendation analytics events are `console.debug`-only** — no analytics backend is wired up;
  `trackRecommendationEvent` is the seam a real provider (Segment, GA, etc.) plugs into later.
- **Mobile has no drawer, so no cart-cross-sell surface exists there** — per the existing
  700px-breakpoint cart-drawer design (`Documentations MD/responsive-cart-drawer.md`), unchanged
  by this feature. A compact horizontal cross-sell section on the Cart/Checkout page for mobile was
  explicitly out of scope for this pass.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-10 | Claude | Initial version — recommendation engine (`pdp` + `cart-cross-sell` strategies), `useRecommendations` hook, `CartRecommendations` cart-drawer rail, compact `ProductCard` variant with Quick Add/Select Options, recently-viewed history signal, analytics event stubs, Vitest unit suite (new to this repo) + 3 new Playwright interaction tests |
