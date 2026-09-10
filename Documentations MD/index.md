# Documentation Index

This file is the master index for everything in `Documentations MD/`. Every feature/change doc
must have a row here. Keep it current — update this file in the same commit that adds or edits
a feature doc.

Template for new docs: [template.md](template.md)

## Index

| File | Feature | Branch | Status | Last updated |
|------|---------|--------|--------|--------------|
| [template.md](template.md) | (template — not a real feature) | — | — | — |
| [figma-homepage-redesign.md](figma-homepage-redesign.md) | Figma homepage redesign (Home + global Header/Footer) | figma | Done (other pages deferred) | 2026-09-08 |
| [figma-shop-product-odoo-integration.md](figma-shop-product-odoo-integration.md) | Shop/Product Detail rebuild + Odoo catalog architecture | figma | In Progress (Header mega-menus + real Odoo integration deferred) | 2026-09-08 |
| [frontend-foundation-uiux-refactor.md](frontend-foundation-uiux-refactor.md) | Frontend foundation UI/UX refactor (layout/spacing primitives, ProductMedia, ProductCard/Rail/Cart/Header fixes, semantic data corrections, Playwright visual tests) | figma | Done | 2026-09-09 |
| [responsive-cart-drawer.md](responsive-cart-drawer.md) | Responsive mini-cart drawer (tablet/desktop) + mobile Add-to-Cart icon feedback, 700px breakpoint | figma | Done | 2026-09-10 |
| [personalized-product-recommendations.md](personalized-product-recommendations.md) | Shared recommendation engine (PDP "You might also like" + cart-drawer "You Might Also Need" cross-sell rail) | figma | Done (Home "personalized" strategy deferred) | 2026-09-10 |

## Revision log

| Date       | Author | Change                                                        |
|------------|--------|----------------------------------------------------------------|
| 2026-09-07 | Claude | Created `Documentations MD/` structure: index.md + template.md |
| 2026-09-07 | Claude | Added figma-homepage-redesign.md: rebuilt Home + Header/Footer to match the Figma prototype |
| 2026-09-08 | Claude | Updated figma-homepage-redesign.md: rebuilt Shop-by-Cars/Bikes into a full-bleed diagonal banner; replaced the Hero's fabricated accessory swatches and stock rider photo with real, previously-unused catalog product photography |
| 2026-09-08 | Claude | Added figma-shop-product-odoo-integration.md: Odoo/catalog service-layer scaffolding, then (after screenshots arrived) consolidated ProductCard and rebuilt Shop + Product Detail (desktop/mobile) to match the Figma reference |
| 2026-09-09 | Claude | Added frontend-foundation-uiux-refactor.md: layout/spacing primitives, ProductMedia/ProductPlaceholder, ProductCard DOM+rating bug fixes, Rail boundary arrows, cart removeLine/setQuantity/clearCart, PDP Buy Now honesty, Shop tag filter, VehicleBrandGrid real links, Header chevron removal, 3 Home.tsx semantic data-mapping fixes, first Playwright visual-regression suite |
| 2026-09-09 | Claude | Updated frontend-foundation-uiux-refactor.md: fixed VehicleShopSplit's left-edge alignment and vehicle-image overhang after user screenshot review |
| 2026-09-09 | Claude | Updated frontend-foundation-uiux-refactor.md: fixed CategoryIconStrip's hover ring rendering as broken arcs after another user screenshot |
| 2026-09-09 | Claude | Updated frontend-foundation-uiux-refactor.md: fixed the ring's default-state contrast and media-gated its hover color behind (hover: hover) and (pointer: fine) so it can't get stuck on touch devices |
| 2026-09-09 | Claude | Added responsive-cart-drawer.md: CartContext activity/drawer-state API, tablet/desktop cart drawer, mobile Add-to-Cart icon feedback (700px breakpoint), Buy Now feedback suppression, toast removed from cart actions, 12-test Playwright interaction suite |
| 2026-09-10 | Claude | Added personalized-product-recommendations.md: new shared recommendation engine (`pdp` + `cart-cross-sell` strategies), `useRecommendations` hook, cart-drawer "YOU MIGHT ALSO NEED" rail with Quick Add/Select Options, compact `ProductCard` variant, recently-viewed history signal, analytics event stubs, Vitest unit suite (new to this repo) + 3 new Playwright interaction tests. Updated responsive-cart-drawer.md with the integration touch point. |
