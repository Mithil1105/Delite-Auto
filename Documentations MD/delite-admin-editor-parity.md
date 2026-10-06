# Delite Admin CMS Editor — Hasto Visual-Editor Parity

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Real rendered previews (all Homepage sections + Navigation + Footer + Promotions), Desktop/Tablet/Mobile preview toggle, media picker on remaining URL fields, focal-point/zoom/per-device image positioning, unsaved-navigation warning, undo/redo |
| File           | `Documentations MD/delite-admin-editor-parity.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | Superseded in part — see `Documentations MD/delite-cms-visual-editor.md` (2026-09-30), which closed most of the gaps below (real Navigation/Footer/promo-banners previews, PromoBannerPair now reads focal point, shared toolbar, Homepage 3-pane editor). Add/Duplicate/Remove Section remains deferred. |
| Created        | 2026-09-29 |
| Last updated   | 2026-09-30 |

## Summary

Closes most of the visual-CMS-editor gap flagged by the read-only completeness audit
(`Documentations MD/delite-admin.md`'s "Known gaps" + a follow-up Hasto-parity request): every
Homepage section, Navigation, Footer, and Promotions now has a real rendered preview (reusing the
actual storefront components wherever the draft content is self-contained, and a faithful
structural mockup where it isn't); every preview has a Desktop/Tablet/Mobile toggle; the two
remaining raw-URL image fields (`vehicle-shop-split`'s car/bike images) now use the same
`AdminMediaPicker` already built for Promotions/Homepage Categories; Promotion images gained real
focal-point/zoom/per-device positioning; every draft editor warns before an unsaved-changes
navigation-away; every draft editor has undo/redo.

## Why

The prior audit found: only Hero/Announcement had a genuine live-component preview, everything
else in `HomeSectionEditor.tsx` had a fake text-summary "preview" card; Promotions/Navigation/
Footer had no preview at all; no editor had a responsive breakpoint toggle; no editor had undo/
redo or unsaved-navigation protection; focal-point/zoom didn't exist anywhere in the stack. The
user asked for this parity gap closed directly (a follow-up to the audit, not a new audit).

**Constraint this pass worked under:** a concurrent editing session was active on `Home.tsx` and
`PromoBannerPair.tsx` (confirmed via the harness's own "file changed on disk since you last read
it" signal) for the duration of this work. Every new/changed file in this pass lives under
`src/admin/**` (plus one additive migration and one test-fixture fix) — **`Home.tsx` and
`PromoBannerPair.tsx` were never read or touched**, and no other storefront component was
modified, only imported read-only for reuse in a preview. This is why Promotions' preview is a
self-contained mockup rather than a `<PromoBannerPair>` reuse, and why "Add/Duplicate Section" is
deferred rather than built (see Known gaps).

## Scope

**In scope:** `PreviewFrame` (Desktop/Tablet/Mobile toggle), `useUndoRedo`, `useUnsavedChangesGuard`,
`ImagePositionControl` (focal X/Y + zoom + reset + per-device tabs), `HomeSectionPreview` (real
rendered preview per Homepage section type), wiring all of the above into `HomeSectionEditor.tsx`,
`Hero.tsx`, `Announcement.tsx`, `Promotions.tsx`, `Navigation.tsx`, `Footer.tsx`; a small additive
migration adding `image_position`/`mobile_image_position` jsonb columns to `cms_promotions`; the
`vehicle-shop-split` car/bike image fields converted from raw URL text inputs to the existing
`AdminMediaPicker`.

**Explicitly not in scope this pass:** Add Section / Duplicate Section (see Known gaps — an
architectural blocker, not a time-boxing choice); storefront consumption of the new focal-point/
zoom values (they're real, stored, and applied in the Admin's own preview; whether `PromoBannerPair`
itself should read and apply them on the live site is a separate, follow-up decision that needs
its own review — not decided or built here, to avoid touching a file under concurrent edit).

## Real rendered preview, section by section

`src/admin/components/HomeSectionPreview.tsx` — a `switch` on `sectionKey`, reusing the actual
storefront component wherever the section's own draft content is self-contained:

- **`vehicle-shop-split`** → real `<VehicleShopSplit content={draft} />` (already prop-overridable).
- **`testimonials`** → real `<TestimonialCarousel items={draft.items} />`.
- **`get-in-touch`** → real `<GetInTouchBox content={draft} />`.
- **`brands`** → real `<VehicleBrandGrid vehicle="car" names={...} />`, parsing the draft's
  newline-separated brand-name field.
- **`top-categories-car` / `top-categories-bike`** → real `<PillTabs variant="segmented">` +
  real `<ProductCarousel>`, fed **real Odoo products** via the existing `useMerchandisedProducts`
  hook — these two sections' own draft content already carries the product-id arrays
  (`seatCoversIds`, etc., set via the existing `AdminProductPicker`), so full real-data fidelity
  was achievable without any new data-fetching.
- **`trending` / `perfect-vehicle` / `category-strip`** → real heading/tab/CTA layout, but an
  honest note instead of fabricated products/categories — their real selections live on a
  *separate* CMS page (`merchandising`), not in this section's own draft; cross-fetching that
  page was judged unnecessary scope for this pass (the linked "Edit section items and products →"
  page already shows the real picker). No placeholder product was ever invented.
- **`promo-banners`** → a real, live `cms_promotions` read (draft-visible to an admin via existing
  RLS) rendered with a small **self-contained** card (not an import of `PromoBannerPair.tsx` — see
  "Why," concurrent-edit constraint). Shows real heading/subheading/CTA/image for every currently
  configured promotion, exactly as Promotions.tsx itself would list them.

## Navigation / Footer preview

Neither `src/components/Footer.tsx` nor the header nav markup in `Header.tsx` accepts a
content-override prop today (confirmed by direct inspection — `Footer()` takes no props at all,
reading published CMS content internally). Rather than add that prop (a storefront-file change,
avoided this pass per the concurrent-edit constraint), both editors gained a **faithful structural
mockup** built from the same draft state, wrapped in the same `PreviewFrame`: Navigation shows a
real header-bar mockup (desktop: horizontal link row; tablet/mobile: hamburger icon, matching the
site's actual `lg:hidden` breakpoint behavior) using the draft's own visible/ordered links; Footer
shows a real dark footer-column mockup using the draft's own contact/social/quick-links/copyright
fields. Not byte-identical to the live component, but genuinely reflects the draft content and
breakpoint — a real improvement over "no preview at all."

## Desktop / Tablet / Mobile preview (#new)

`src/admin/components/PreviewFrame.tsx` — a width-constrained frame (1280/768/390px) with a
3-button toggle, wrapping every preview listed above. Supports a render-prop children form
(`children={(breakpoint) => ...}`) so a preview can genuinely react to the selected breakpoint —
used by Promotions to show the mobile-specific image/position when "Mobile" is selected, and by
Navigation to switch between the horizontal-link and hamburger mockups.

## Media picker instead of URL textbox

`HomeSectionEditor.tsx`'s `vehicle-shop-split` car/bike image fields switched from raw
`<input type="url">` to the existing `AdminMediaField` (built in the prior commerce-completion
phase for Promotions/Homepage Categories). **The storefront contract is unchanged** — picking an
image resolves it to a full `mediaPublicUrl()` string *before* it's written into `content`, so
`content.carImage`/`content.bikeImage` still store a plain external URL string exactly as before;
`VehicleShopSplit.tsx` needed no change and was not touched.

## Image focal point / zoom / per-device positioning

`src/admin/components/ImagePositionControl.tsx` — X/Y sliders (0-100%), a zoom slider (1.0-2.5×),
a live crop preview, a per-device tab (Desktop/Tablet/Mobile) with its own independent
values, and a "Reset" that clears just the active device's override. Values are stored as
`{x, y, zoom}` per device in a jsonb column — **not** a new generic column on `cms_media` (a focal
point is a property of *how an image is used in a specific placement*, not an intrinsic property
of the asset itself; the same image could be positioned differently in two different promotions).
Wired into Promotions' image + mobile image fields via two new `cms_promotions` columns
(`image_position`, `mobile_image_position`, both jsonb, additive migration
`20260929095000_promotion_image_position.sql`). `imagePositionStyle()` (also exported from the
same file) turns a stored position into real CSS (`object-position` + `transform: scale()`) —
used identically by the control's own crop preview and by the Promotions live preview pane.

## Unsaved-navigation warning

`src/admin/hooks/useUnsavedChangesGuard.ts` — real browser-level protection (`beforeunload` for
tab close/refresh/typed URL) plus in-app protection via a capture-phase document click listener on
same-app `<a href>` clicks (works with `react-router-dom`'s `<Link>`, which renders a real anchor
under a bubble-phase handler — intercepting in the capture phase and calling `preventDefault()` on
cancel stops that bubble handler from ever firing). **Not `useBlocker`** — this app uses a plain
declarative `<BrowserRouter>` (confirmed via `App.tsx`), and `useBlocker` only works with a data
router (`createBrowserRouter`); switching router types was out of scope and risky given the
concurrent edit on `Home.tsx`'s route tree area. Wired into every editor touched this pass
(`HomeSectionEditor`, `Hero`, `Announcement`, `Promotions`, `Navigation`, `Footer`).

## Undo / Redo

`src/admin/hooks/useUndoRedo.ts` — a generic, per-editing-session history stack (max 50 entries,
client-side only — publishing still only ever writes the single current draft, this never becomes
a database revision history). `set()` pushes a history entry; `setWithoutHistory()` (used once,
when the initial draft loads from the server) does not, so "Undo" can never rewind past what was
actually loaded from the database. Wired into every editor touched this pass with visible
Undo/Redo buttons (disabled when there's nothing to undo/redo).

## Interfaces / data

- `PreviewFrame({ children: ReactNode | (bp: "desktop"|"tablet"|"mobile") => ReactNode; label? })`
- `useUndoRedo<T>(initial)` → `{ value, set, setWithoutHistory, undo, redo, canUndo, canRedo }`
- `useUnsavedChangesGuard(dirty: boolean)`
- `ImagePositionControl({ imageUrl, value, onChange })`, `imagePositionStyle(pos)`,
  `ImagePosition = { x, y, zoom }`, `ImagePositionByDevice = { desktop?, tablet?, mobile? }`
- `HomeSectionPreview({ sectionKey, content })`
- `PromotionInput`/`PromotionRow` gained `imagePosition`/`mobileImagePosition:
  ImagePositionByDevice | null`
- New columns: `cms_promotions.image_position`, `cms_promotions.mobile_image_position` (jsonb)

## Dependencies

None new — every primitive is built from existing React/Tailwind/lucide-react patterns already
used throughout this admin.

## Testing / verification

- `npm run build`/`lint`/`typecheck:server`/`test:unit` (106 passed/1 skipped, including a
  one-line fixture fix in `cms.boundary.test.ts` for the two new `PromotionInput` fields) — all
  clean.
- Not live-clicked-through this pass (no interactive admin browser session available) — every
  change is additive/isolated to `src/admin/**` plus one additive migration, verified by
  successful build + typecheck rather than a driven browser session. See Known gaps.

## Known issues / follow-ups

- **Add Section / Duplicate Section were explicitly deferred, not time-boxed out.** The current
  architecture hard-wires each `section_key` to one specific JSX block inside `Home.tsx`'s
  `blocks` record — there is no generic "renderer for an arbitrary new section type," and
  `cms_sections` has a `unique (page_id, section_key)` constraint, so a literal "duplicate" would
  either collide or require a new key Home.tsx doesn't know how to render. Building real support
  for this needs a `Home.tsx` change (a dynamic block registry or a generic "custom content block"
  renderer) — deliberately not attempted this pass given `Home.tsx` was under concurrent edit by
  another session. Remove Section already has a real equivalent (the existing visibility
  hide/show toggle on `Homepage.tsx`) — true row deletion was judged lower-value than the
  data-loss risk of building it under time pressure.
  Structural remove/undo without a Home.tsx change (deleting a `cms_sections` row, which cascades
  to drafts/published) is a real gap.
- ~~PromoBannerPair does not (yet) read the new `image_position`/`mobile_image_position`
  columns~~ — **closed 2026-09-30**: `PromoBannerPair` now accepts and applies per-device
  focal-point/zoom on both the real storefront and every admin preview. See
  `Documentations MD/delite-cms-visual-editor.md`.
- **Trending/Perfect-Vehicle/Category-Strip previews don't show real products/categories** — their
  real selections live on a separate CMS page; cross-fetching was judged out of scope for this
  pass (see Scope). The existing "related" link to that page remains the actual editing path.
  **Update 2026-09-30**: this was in fact closed in the same pass that fixed the two items above —
  `HomeSectionPreview.tsx` now resolves and renders real curated products/categories for all three
  via the existing merchandising hooks; this line is left here only as a historical record of what
  the prior audit found, not a current gap.
- ~~Navigation/Footer previews are faithful mockups, not the real components~~ — **closed
  2026-09-30**: both editors now mount the real `<Header>`/`<Footer>` components (with a new
  `contentOverride` prop each) inside `PreviewFrame`, whose new generic click/submit interceptor
  makes it safe to do so. See `Documentations MD/delite-cms-visual-editor.md`.
- **No live browser click-through this pass** — verified by build/typecheck/unit tests only. Still
  true as of 2026-09-30's follow-up pass — see that doc's own Testing section for why.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-29 | Claude | Initial version — real rendered preview for every Homepage section (reusing real components where content is self-contained, honest partial views where real data lives on a separate CMS page), Navigation/Footer structural previews, Desktop/Tablet/Mobile preview toggle everywhere, media picker on the last two raw-URL image fields, Promotion image focal-point/zoom/per-device positioning (new jsonb columns), unsaved-navigation-warning and undo/redo on every draft editor. Built entirely under src/admin/** (plus one additive migration) to avoid a concurrent editing session active on Home.tsx/PromoBannerPair.tsx. Add/Duplicate Section explicitly deferred — architectural blocker, not a scope cut. |
| 2026-09-30 | Claude | Superseded in part by `delite-cms-visual-editor.md` — the concurrent-edit constraint this doc worked under no longer applies, so this pass closed most of the "Known issues" listed above (real Navigation/Footer/promo-banners/trending/perfect-vehicle/category-strip previews, PromoBannerPair now applies focal point on the real storefront). Marked closed items with strikethrough rather than deleting them, so the historical record of what the original audit found stays intact. |
