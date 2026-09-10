# Responsive Cart Drawer / Add-to-Cart Feedback

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Responsive mini-cart drawer + Add-to-Cart feedback |
| File           | `Documentations MD/responsive-cart-drawer.md` |
| Branch         | figma                                   |
| Owner          | Claude (pairing with the user)          |
| Status         | Done                                     |
| Created        | 2026-09-09                              |
| Last updated   | 2026-09-10                              |

## Summary

Two deliberately different Add-to-Cart feedback experiences, split at a 700px breakpoint. On
tablet/desktop, a real Add to Cart auto-opens a right-side mini-cart drawer showing the full
current cart — the customer stays on the page. On mobile, no drawer opens; instead the navbar
cart icon does a short bounce and a small "✓ Added" bubble appears near it for ~1.5s, then
disappears. Buy Now still adds the product but is explicitly excluded from both feedback paths —
it's a distinct action navigating straight toward checkout, not an Add to Cart. The old generic
toast no longer fires for cart actions (it still does for wishlist).

## Why

The user asked for a Hasto-style slide-in cart drawer on tablet/desktop and a lightweight,
non-blocking mobile confirmation, driven by one shared cart-activity system rather than duplicated
feedback logic in every Add-to-Cart button. They also flagged that the previous cart removal
implementation modeled quantity changes via `addToCart(product, negativeQty)`, which is fragile —
this pass replaces that with real `setQuantity`/`removeLine` operations (already added in
`frontend-foundation-uiux-refactor.md`'s pass, reused and extended here) everywhere a cart
quantity is touched, including the new drawer.

## Scope

**In scope:** `CartContext`'s activity/drawer-state API, the cart drawer and its subcomponents,
the mobile "Added" indicator, Header's cart-icon behavior split by breakpoint, Buy Now's feedback
suppression, removing the generic toast from cart actions, a reusable `useMediaQuery` hook, and a
permanent Playwright interaction-test suite for all of the above.

**Explicitly not in scope** (per the request): Hero, homepage spacing, Shop/PDP layout, Odoo
integration, or any other Figma work — none of those files were touched. A real payment/checkout
flow was also not built — see "Checkout" below.

## Implementation notes

### CartContext (`src/context/CartContext.tsx`)
- New `CartActivity` type: `{ type: "item-added"; productId: string; timestamp: number; id: number }`.
  `id` is a monotonically increasing ref counter (`activityIdRef`), not derived from `cartCount` —
  adding a second unit of the *same* product must still produce a distinct activity so consumers
  (drawer highlight, mobile indicator's timer) can tell it apart and restart their own transient
  state, which comparing `cartCount` before/after can't do (a repeat add of an existing line
  changes `qty`, not the number of lines, and even the qty delta is ambiguous from `cartCount`
  alone once multiple products are in the cart).
- `addToCart(product, qty = 1, options?: { feedback?: boolean })` — unchanged add/merge logic;
  `options.feedback === false` (used only by Buy Now) skips creating an activity and skips opening
  the drawer entirely. Otherwise it always records a new `CartActivity`, and opens the drawer only
  when currently at the drawer breakpoint (see below) — on mobile the activity still fires (so
  `MobileCartAddedIndicator` can react to it), it just never sets `isCartDrawerOpen`.
- New `isCartDrawerOpen`, `openCartDrawer()`, `closeCartDrawer()`, `recentCartActivity`. Internally,
  `isCartDrawerOpen` is *derived* (`isCartDrawerOpenRaw && isDrawerBreakpoint`), not synced via a
  `useEffect` — this means a live resize/rotation below 700px hides the drawer immediately with no
  extra effect, and (deliberately) `addToCart` only ever sets the raw flag `true` when already at
  the drawer breakpoint, so a stale "raw open" flag from a mobile add can't cause the drawer to pop
  open later if the viewport subsequently grows without another Add to Cart happening.
- `showToast(...)` was removed from `addToCart` entirely — it's now only called from
  `toggleWishlist`. This is *the* change that stops cart adds from producing the old bottom toast;
  `src/components/Toast.tsx` itself is untouched (it just renders whatever `toast` string is set,
  and nothing sets it for cart actions anymore).
- `removeLine`/`setQuantity`/`clearCart` were already correct (added in the prior
  `frontend-foundation-uiux-refactor.md` pass) — not re-implemented, just reused throughout the
  new drawer.

### Breakpoint (`src/hooks/useMediaQuery.ts`, exported constant in `CartContext.tsx`)
- New generic `useMediaQuery(query: string): boolean` hook (matchMedia + a change listener) —
  avoids scattering `window.innerWidth` checks through components, per the request.
- `CART_DRAWER_BREAKPOINT = "(min-width: 700px)"` is exported from `CartContext.tsx` as the single
  source of truth and imported by `Header.tsx` and `MobileCartAddedIndicator.tsx`, rather than each
  file re-declaring the query string. Deliberately not Tailwind's `md` (768px) — iPad/tablet
  portrait (e.g. 768×1024, 820×1180) needs to land on the drawer side of the split, not the mobile
  side, and 768px sits exactly on that boundary.

### Cart drawer (`src/components/cart/`)
- `CartDrawer.tsx` — mounted **once**, in `Layout.tsx`, after `<Toast />`. Always renders (not
  conditionally unmounted when closed) so the close transition has something to animate; visibility
  is `translate-x-full`/`opacity-0`/`pointer-events-none` when `!isCartDrawerOpen`, plus
  `aria-hidden={!isCartDrawerOpen}` on the panel. Width: `w-[360px]` (700–899px) →
  `min-[900px]:w-[420px]` (900px+, within the requested 400–440px range). Backdrop:
  `bg-ink/40`, fades via `transition-opacity`. Panel slides via `transition-transform
  duration-[260ms]`; both respect `motion-reduce:transition-none`.
  - Body scroll lock: a `useEffect` keyed on `isCartDrawerOpen` sets/restores
    `document.body.style.overflow`, with the restore also running on unmount (defensive — the
    drawer is never actually unmounted in practice since it's global, but this is correct
    regardless).
  - Focus management: on open, the previously-focused element is captured and the close button is
    focused; on close, focus returns to that captured element (in practice: the header cart button,
    or an Add to Cart button on the page, whichever triggered the open).
  - **Focus trap**: `Tab`/`Shift+Tab` are intercepted while open and wrapped within the panel's
    focusable elements — added after testing showed that without it, keyboard focus could reach
    background page content while the drawer was open (a real accessibility gap, not just a
    theoretical one — verified via an actual Tab-key test, not just checking the DOM).
    `Escape` closes.
  - New/updated line highlight: `recentCartActivity` drives a `highlightedProductId` state
    (cleared after 800ms) plus a `scrollIntoView` call on that line's ref — covers both a brand
    new line and an existing line whose quantity just went up, per the request.
  - Empty state: `ShoppingBag` icon, `cart.empty`/`cart.emptyDesc` (reused from the existing Cart
    page's i18n keys), a "Continue Shopping" link to `/shop` (closes the drawer on click).
- `CartDrawerItem.tsx` — image, name, brand (metadata row — the one place colour/vehicle/model/
  fitment will slot in later without a layout change, per the request; `Product` doesn't carry
  those fields yet so nothing more is rendered there today), qty stepper (`setQuantity`), "Remove"
  (`removeLine`), line price. `forwardRef` so `CartDrawer` can hold a ref map for the
  highlight/scroll-into-view behavior.
- `CartDrawerSummary.tsx` — subtotal (`formatINR`, no duplicated formatting logic), shipping note,
  "View Cart" (closes the drawer, navigates to `/cart` — the one working CTA), and a **disabled**
  Checkout button with a "Checkout coming soon" caption underneath (see "Checkout" below).
- `MobileCartAddedIndicator.tsx` — mounted inside Header's cart-icon wrapper (which already had
  `className="relative ..."`, reused as the positioning anchor — no manual coordinate math).
  Renders `null` entirely at the drawer breakpoint (mobile-only). On a new `recentCartActivity`, it
  becomes visible for 1500ms; a repeat activity before that timer fires clears and restarts the
  same timer rather than stacking a second bubble. The bubble is `role="status" aria-live="polite"`
  so the confirmation is announced to screen readers too, not just visually shown — the visible
  "✓ Added" text itself is unconditionally required by the spec, not a substitute.

### Header (`src/components/Header.tsx`)
- The cart `<Link to="/cart">` gained an `onClick` that, only when `isDrawerBreakpoint` is true,
  calls `e.preventDefault()` and `openCartDrawer()` instead of navigating. Below 700px it's
  untouched — a plain link to `/cart`.
- The `ShoppingCart` icon gets `animate-cartBounce` (new Tailwind keyframe, see below) only when
  *not* at the drawer breakpoint, restarted on every `recentCartActivity` via a `key` prop
  (remounting a small icon to restart a CSS animation is simpler and just as correct as a
  timer-based class-toggle here).
- Renders `<MobileCartAddedIndicator />` inside the same `relative` wrapper as the icon.

### Buy Now (`src/pages/ProductDetail.tsx`)
- `addToCart(product, qty, { feedback: false })` — still adds the product and still navigates to
  `/cart` (unchanged from the prior pass), but the `feedback: false` option means no activity is
  recorded at all, so neither the drawer nor the mobile indicator can react to it. Verified this
  holds on both breakpoints.

### Cart page (`src/pages/Cart.tsx`)
- Already used `setQuantity`/`removeLine` correctly (fixed in the prior
  `frontend-foundation-uiux-refactor.md` pass) — not re-implemented here.
- The one change: the Checkout button gained `disabled` + `aria-disabled="true"` + muted styling,
  matching the drawer's treatment (see "Checkout" below) — it was previously an
  active-looking button with no `onClick` at all.

### Tailwind (`tailwind.config.js`)
- New keyframes/animations: `cartBounce` (320ms scale 1 → 1.15 → 0.96 → 1, the mobile icon
  bounce) and `cartHighlight` (800ms background-color fade, the drawer's newly-added-line
  highlight) — added alongside the existing `marquee`/`fadeUp` entries, same pattern.

## Interfaces / data

- `CartActivity { type: "item-added"; productId: string; timestamp: number; id: number }`
- `CartContextValue` gained: `addToCart`'s third `options?: { feedback?: boolean }` parameter,
  `isCartDrawerOpen: boolean`, `openCartDrawer(): void`, `closeCartDrawer(): void`,
  `recentCartActivity: CartActivity | null`
- `useMediaQuery(query: string): boolean` (`src/hooks/useMediaQuery.ts`)
- `CART_DRAWER_BREAKPOINT = "(min-width: 700px)"` (exported from `CartContext.tsx`)
- New i18n keys (en/hi/gu, all in lockstep) under `cart`: `itemsCount`, `viewCart`,
  `continueShopping`, `added`, `closeCart`, `checkoutComingSoon`, `remove`

## Dependencies

None added. Reuses the existing `@playwright/test` devDependency (added in the prior pass) for the
new interaction-test suite.

## Testing / verification

- `npx tsc -b --noEmit` — clean.
- `npm run lint` — 2 new warnings, both reviewed and accepted as legitimate: `set-state-in-effect`
  on `MobileCartAddedIndicator.tsx` and `CartDrawer.tsx`'s highlight effect. Both start a
  `setTimeout` and (the drawer one) call `scrollIntoView` — genuine "synchronize with an external
  system" effects (the rule's own suggested exception), not something derivable during render.
  Two other places that originally used effects unnecessarily (a "has the drawer ever opened"
  latch, and a "close on resize" sync) were refactored to avoid the warning entirely — a ref
  mutated during render turned out to itself violate a different lint rule
  (`react(refs): Cannot access refs during render`), so that one was simplified further by just
  always rendering the drawer's DOM (translated off-screen) instead of lazy-mounting it; the resize
  case was refactored into a derived boolean instead of a synced one. No other new warnings; the 3
  warnings present before this pass are unchanged.
- `npm run build` — clean.
- `npm run test:visual` (now covers both `tests/visual/` and `tests/interaction/`, split into
  separate Playwright projects via `testMatch` in `playwright.config.ts`) — all 16 tests pass:
  the 4 pre-existing homepage visual-regression tests (confirming this feature didn't touch
  Home/Hero — pixel-identical to the prior baseline) plus 12 new interaction tests in
  `tests/interaction/cart-drawer.spec.ts`:
  - Tablet (820×1180) and desktop (1440×900): Add to Cart opens the drawer, shows the full cart +
    subtotal, doesn't navigate.
  - Re-adding the same product increments quantity, not a duplicate line.
  - Drawer quantity +/- and Remove work, including the empty state after removing the only item.
  - Close via X, backdrop click, and Escape — each restores body scroll.
  - Header cart button opens the drawer without navigating; View Cart closes it and navigates to
    `/cart`.
  - Focus moves into the drawer on open (close button), is trapped by Tab/Shift+Tab while open,
    and returns to the triggering element on close.
  - Buy Now does not open the drawer.
  - Mobile (390×844, touch-emulated): Add to Cart never opens the drawer and never locks body
    scroll; the "✓ Added" bubble appears, the badge count updates, and the bubble clears itself
    after ~1.5s; the navbar cart is a plain link to `/cart`; Buy Now does not show the bubble.
- Manually verified via a throwaway Playwright script (not committed) across the full requested
  viewport matrix — mobile 375×812/390×844/430×932 (no drawer, confirmed), tablet
  744×1133/768×1024/820×1180 (drawer, confirmed), desktop 1280×800/1440×900/1920×1080 (drawer,
  confirmed) — and `document.documentElement.scrollWidth <= window.innerWidth + 1` held at every
  one (no horizontal overflow introduced).
- Also verified: the generic toast never fires for cart adds (checked for its exact "Added ... to
  cart" text — absent) while it still fires for wishlist toggles (checked for its "wishlist" text —
  present); `prefers-reduced-motion: reduce` makes the drawer panel's computed
  `transitionDuration` `0s`.
- No `pageerror`/console errors observed across any of the above.

## Accessibility

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="cart-drawer-heading"` on the panel.
- Close button: `aria-label` from `cart.closeCart` ("Close cart").
- Focus moves into the drawer on open (close button), is trapped within it (Tab/Shift+Tab wrap;
  verified with real key presses, not just DOM inspection), and returns to the triggering element
  on close.
- `Escape` closes.
- The mobile "✓ Added" bubble is `role="status" aria-live="polite"` — screen reader users get the
  same confirmation non-visually, not just the visual bounce/bubble.
- `prefers-reduced-motion: reduce` removes the drawer's slide/fade transitions and the mobile
  icon's bounce animation (`motion-reduce:transition-none` / `motion-reduce:animate-none`
  throughout).

## Recommendation integration (2026-09-10)

The drawer's scrollable body now also mounts `<CartRecommendations />` (from
`src/components/cart/CartRecommendations.tsx`) between the cart-lines list and the sticky
`CartDrawerSummary` footer — a "YOU MIGHT ALSO NEED" rail of up to 4 compact cross-sell products,
powered by the shared recommendation engine's `"cart-cross-sell"` strategy. Full detail (scoring,
Quick Add behavior, the compact `ProductCard` variant, testing) lives in
`Documentations MD/personalized-product-recommendations.md` — this note just marks the touch
point. Nothing about this drawer's own structure (breakpoint, open/close, focus trap, body-scroll
lock, highlight-on-add) changed; `CartDrawerSummary` remains a sibling outside the scroll
container, unaffected by the new content above it, so Subtotal/View Cart/Checkout stay visible
without scrolling past recommendations.

## Known issues / follow-ups

- **Checkout is intentionally disabled, not hidden**, in both the drawer and the full Cart page —
  a real checkout/payment flow doesn't exist yet (explicitly out of scope). "View Cart" is the one
  working CTA. Revisit once a real checkout flow exists.
- **Cart line metadata is brand-only today** — `Product` doesn't carry colour/vehicle/model/year/
  fitment fields yet (only `ProductDetail`, used solely on the PDP, has a `colours`/`variants`
  shape). `CartDrawerItem`'s metadata row is deliberately structured so those can be added later
  without a layout change, but nothing renders there yet beyond brand.
- **The interaction tests set their own viewport per test** rather than relying on Playwright
  "device" presets, and run under one dedicated `interaction` project
  (`playwright.config.ts`) separate from the 4 visual-regression projects — this keeps the
  breakpoint matrix (mobile/tablet/desktop) covered within a single spec file without needing a
  project per breakpoint, but it does mean these tests always run in a desktop-shaped browser
  context with the viewport resized, not a true mobile Chrome/Safari device emulation beyond
  `hasTouch`/`isMobile` context options.
- **No CI pipeline** — as before, Playwright runs/baselines are local-only (Windows-rendered).

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-09 | Claude | Initial version — CartContext activity/drawer-state API, CartDrawer + CartDrawerItem + CartDrawerSummary + MobileCartAddedIndicator, useMediaQuery hook, Header cart-icon breakpoint split, Buy Now feedback suppression, toast removed from cart actions, Cart.tsx/drawer Checkout disabled, 12-test Playwright interaction suite |
