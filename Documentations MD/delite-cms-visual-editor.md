# Hasto-Style CMS Visual Editor + MFA Backend Hardening

## Metadata

| Field          | Value                                    |
|----------------|-------------------------------------------|
| Feature name   | Consistent real-component visual-editing shell across all Website/Homepage CMS editors, media focal-point storefront wiring, shared editor toolbar, 3-pane Homepage editor, and backend (Edge Function + RLS) MFA enforcement |
| File           | `Documentations MD/delite-cms-visual-editor.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | Done — Add/Duplicate/Remove Section assessed only (recommendation, no code), per explicit instruction. Two follow-up passes (both 2026-09-30/2026-10-02) re-audited against near-duplicate detailed specs for this same phase; found and closed real gaps each time rather than re-implementing what already existed. |
| Created        | 2026-09-30 |
| Last updated   | 2026-10-02 |

## Summary

Brings every Website CMS editor (Homepage generic sections, Hero, Announcement, Promotions,
Navigation, Footer, SEO) to one consistent visual-editing experience — a shared toolbar, real
storefront components in every preview (not mockups), a Desktop/Tablet/Mobile responsive toggle, a
generic click/submit-neutralizing wrapper that makes it safe to mount ANY real component (Header
nav, Footer links, product cards) inside a preview, and session-level undo/redo with keyboard
shortcuts. Rebuilds `Homepage.tsx` into a 3-pane navigator/preview/inspector editor. Separately —
flagged in the originating spec as an "IMPORTANT SECURITY FOLLOW-UP" — hardens the mandatory-MFA
policy from a frontend-only route guard into real backend enforcement (Edge Functions + RLS) via a
shared, reusable authorization helper.

## Why

`delite-admin-editor-parity.md` (the prior pass) closed most of the "fake preview" gap but left
real, confirmed items open (see its own Known issues, now marked closed/superseded there): Navigation/
Footer were structural mockups, not the real components; `PromoBannerPair` didn't apply the
focal-point data an editor could already set; Trending/Perfect-Vehicle/Category-Strip previews
didn't show real curated products; six editors hand-duplicated the same Undo/Redo toolbar markup;
Homepage had no visual preview at all, only a reorder/visibility list. Separately, a prior pass's
own Known issues explicitly flagged that mandatory-MFA enforcement lived only in `RoleRoute` — a UX
gate, not a real security boundary, since a stolen AAL1 token could still call a privileged Edge
Function or write directly to an RLS-protected table.

## Scope

**In scope:**
- Generic click/submit interceptor in `PreviewFrame.tsx` (capture-phase, neutralizes
  `a`/`button`/`[role=button]` clicks and all `submit` events without disabling hover/focus/CSS).
- Real `<Header>`/`<Footer>` mounted in the Navigation/Footer editors' previews (new
  `contentOverride` prop on each, plus a controlled `previewMobileMenuOpen` prop on `Header` for
  Navigation's "Preview open menu" toggle).
- `PromoBannerPair` (real storefront component) now applies per-device focal-point/zoom on both
  the live storefront and every admin preview that renders it (`HomeSectionPreview`'s
  `promo-banners` case now selects the mobile image/position columns it previously omitted).
- `useUndoRedo` gained document-level keyboard shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y).
- New shared `EditorToolbar` component, swapped into all 7 editors in place of hand-duplicated
  Undo/Redo/Saved-indicator markup.
- New shared `SectionInspector` component — the 9 "generic" Homepage sections' field-editing form,
  extracted from `HomeSectionEditor.tsx` so it can be reused inline in the new Homepage 3-pane
  editor without a second, drifting copy.
- `Homepage.tsx` rebuilt into a 3-pane Navigator (reorder/visibility + a real status dot) / Preview
  (`FullHomePreview.tsx`, every visible section composed in draft order) / Inspector (inline
  `SectionInspector` for the 9 generic sections; a summary + "Open full editor →" link for Hero,
  which has its own materially different dedicated editor).
- MFA backend hardening: `private.app_config` table (single source of truth),
  `private.admin_mfa_satisfied()` RLS helper, shared `_shared/auth/requireAdmin.ts` Edge Function
  helper, applied to every `admin-*` session-based function plus `review-notify`.
- Security page gained a status card (current session AAL, current policy).

**Explicitly not in scope** (per the originating spec's own exclusions):
- No dynamic/arbitrary page-builder.
- No Add/Duplicate/Remove Section implementation — assessed only, see "Add/Duplicate/Remove
  Section assessment" below.
- No public preview URL.
- No merge of Hero's or Promotions' entire dedicated editors into the Homepage inspector — both
  stay separate, materially different editors; Homepage's inspector shows Hero as a summary + link
  rather than inlining a second, structurally different form (Promotions isn't even a `cms_sections`
  row at all — it's a separate variable-length table, `cms_promotions`, with its own dedicated
  `/admin/website/promotions` page; the Homepage `promo-banners` *section* is just a title label +
  a link to that page, and is treated as one of the 9 "generic" sections since its own field config
  is as trivial as `category-strip`'s).

## Preview side-effect protection: `PreviewFrame`'s click/submit interceptor

`src/admin/components/PreviewFrame.tsx` gained `onClickCapture`/`onSubmitCapture` handlers on its
content wrapper: `neutralizeInteractiveClick` walks up from the click target to the nearest
`a`/`button`/`[role=button]` ancestor and calls `preventDefault()`+`stopPropagation()` if found;
`neutralizeSubmit` does the same unconditionally for any `submit` event. This is the single change
that makes it safe to mount **any** real storefront component inside a preview — Hero's CTA link,
Footer's link columns, Header's nav links and cart/wishlist icons, product-card links — without the
admin browser ever navigating away, submitting a form, or mutating cart/wishlist state. It does not
disable hover/focus/CSS transitions (no `pointer-events: none`), only the specific
navigation/mutation-triggering interaction types.

`PreviewFrame` is a CSS-width-constrained `<div>`, not a real `<iframe>` — this was already known
from the prior pass (real components using `window.matchMedia`/`useMediaQuery` reflect the admin's
actual browser width, not the simulated breakpoint) and remains the reason `PromoBannerPair` and
`Header` both accept an explicit `previewBreakpoint`/`previewMobileMenuOpen` override prop rather
than relying on a real media query or the real hamburger button's click (which the interceptor
above would otherwise swallow).

## Real Navigation / Footer previews

- `src/components/Footer.tsx` gained an optional `contentOverride?: FooterCmsContent` prop that,
  when supplied, short-circuits the component's own `useSiteChromeCms()` read entirely — used only
  by `src/admin/pages/website/Footer.tsx`'s preview (so it reflects UNSAVED keystrokes, not just
  already-saved draft content), never used storefront-side (`Layout.tsx` still calls `<Footer />`
  with no props, unchanged).
- `src/components/Header.tsx` gained the equivalent `contentOverride?: HeaderContentOverride`
  (`{ announcement?, navItems? }`) plus `previewMobileMenuOpen?: boolean` (controlled — when
  provided, drives the mobile drawer's open state instead of `Header`'s own internal state).
  `src/admin/pages/website/Navigation.tsx`'s preview passes `contentOverride={{ navItems: items }}`
  (leaving `announcement` undefined, so the announcement bar itself still reflects live/published
  content — Navigation only edits nav links) and a small toggle button (outside `PreviewFrame`,
  since the real hamburger's click is otherwise intercepted) driving `previewMobileMenuOpen`.
- Both editors' previews now mount the real component inside `PreviewFrame` in place of the prior
  hand-built structural mockup.

## `PromoBannerPair` focal-point wiring (closing a real gap from the prior pass)

`HomeSectionPreview.tsx`'s `promo-banners` case previously queried `cms_promotions` without
`mobile_image_storage_path`/`image_position`/`mobile_image_position`, and always passed
`mobileImage: null, imagePosition: null, mobileImagePosition: null` into `PromoBannerPair` — so an
editor's per-device focal-point/zoom setting had no visible effect there (it DID already work in
`Promotions.tsx`'s own preview, which was fixed in an earlier part of this same phase). Fixed by
selecting the missing columns and mapping them through, matching the pattern already established in
`publishedCmsService.ts`/`usePromotions.ts` for the live storefront path.

## `HomeSectionPreview.tsx`: Trending / Perfect-Vehicle / Category-Strip / Brands

Confirmed via direct file read (not assumed from the prior doc, which had drifted) that these were
already rewritten to use real components before this phase's own edits began: `MerchandisedRailPreview`
(shared by Trending and Perfect-Vehicle) resolves real curated product ids via the existing
`useMerchandisingCms`/`useMerchandisedProducts` hooks and renders the real `<PillTabs>` +
`<ProductCarousel>` pair, with an honest "Product catalog unavailable — Retry" state
(`ProductCatalogUnavailable`) instead of silently losing the selection on an Odoo error;
`CategoryStripPreview` resolves real category selections via `useResolvedCategorySelections` and
renders the real `<CategoryIconStrip>`; `BrandsPreview` has both the car and bike tabs. This
phase's own remaining fix in this file was the `promo-banners` mobile-image/position gap above, and
threading a `previewBreakpoint` prop through from `HomeSectionEditor.tsx`/`FullHomePreview.tsx` so
`promo-banners` can show the mobile-specific image when the Mobile breakpoint is selected (mirrors
the same pattern `Promotions.tsx` already used).

## Undo/Redo keyboard shortcuts

`src/admin/hooks/useUndoRedo.ts` now attaches one `document`-level `keydown` listener per hook
instance (safe because only one editor page is ever mounted at a time under this app's router):
Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes, both call `preventDefault()` so the
browser's own native per-field undo doesn't fight this hook's coarser, coalesced history — even
inside a focused input, Ctrl+Z now triggers this hook's undo, which is the intended behavior since
this hook already tracks the same field's value.

## Shared `EditorToolbar`

`src/admin/components/EditorToolbar.tsx` — a small composed toolbar (Saved/Unsaved indicator +
Undo/Redo buttons with `title`s naming the shortcut + a `children` slot for the editor-specific
Save Draft/Publish buttons, left as a slot rather than forced into one shape because Promotions
publishes per-row via its own `publishPromotion()` while every other editor publishes the whole
page via `cms_publish_page()`). Swapped into all 7 editors
(`Hero.tsx`/`Announcement.tsx`/`Navigation.tsx`/`Footer.tsx`/`Promotions.tsx`/`Seo.tsx`/
`HomeSectionEditor.tsx`) in place of each one's own hand-duplicated markup — purely mechanical,
same visual result, one fewer place for the six-times-duplicated toolbar to drift.

## Homepage 3-pane visual editor

`src/admin/pages/website/Homepage.tsx` was previously reorder/visibility-only, with no preview at
all. Rebuilt into three panes:

- **Navigator (left)**: the existing drag/keyboard reorder + visibility toggle list, now with a
  real status dot per section — `hidden` (gray, not visible), `draft` (amber, the section's own
  `updated_at` is newer than the page's last publish timestamp, from the existing
  `getLastPublication()` — a real signal, not a fabricated one), or `published` (green). Clicking a
  row selects that section for editing (guarded by `confirmDiscardIfDirty()` — a plain
  `window.confirm`, matching the existing pattern already used in `Promotions.tsx`'s own cancel
  flow — if the currently-selected section has unsaved inspector edits) and scrolls the preview pane
  to it (`scrollIntoView`).
- **Preview (center)**: new `src/admin/components/FullHomePreview.tsx` composes every VISIBLE
  section in draft order inside one `PreviewFrame`. Reuses `HomeSectionPreview`'s existing
  per-`sectionKey` switch for every section except `hero` (which has no case in that switch — it's
  rendered directly via the real `<Hero>` component, since Hero has its own separate, already-built
  dedicated editor rather than living in the generic switch). The currently-selected section gets a
  visible outline overlay — applied only in this admin-only preview component, never as a permanent
  storefront style. The section actually being edited shows its LIVE in-progress (unsaved) content
  in the preview, matching every other single-section editor's existing "preview reflects your
  typing" behavior — every other section shows its last-saved draft content.
- **Inspector (right)**: for the 9 generic sections, renders the new shared `SectionInspector`
  inline (same component the standalone `/admin/website/homepage/:sectionKey` deep-link route now
  also uses, via the simplified `HomeSectionEditor.tsx`) with its own Save Draft button (writes
  through the existing `saveSectionDraft()`, then updates local state so the navigator's status dot
  and the preview both reflect the save immediately, no re-fetch needed). For **Hero**, shows a
  read-only summary (heading lines + subheading) and an "Open full editor →" link to
  `/admin/website/hero` — a deliberate scope decision (see Scope above), not an oversight.
- Top-level "Publish" button is unchanged (`publishPage("homepage")`, still confirms first if the
  currently-selected section has unsaved edits that would be left behind).

## Follow-up pass: a second, more detailed spec for the same phase

A second, much more detailed spec (75 sections) for this same overall phase arrived after the
above was already implemented. Its own "expected findings" audit section described the PRE-this-
pass state (Promotions/Navigation/Footer with no real preview, generic sections mostly fake) —
already out of date by the time it arrived. Rather than re-implement what was already done, this
follow-up re-audited the current code directly (not the spec's own stale assumptions) and found
two genuine remaining gaps, both closed below, plus confirmed several items were already correctly
handled.

### Media Library search / filter / pagination (closed)

`src/admin/pages/media/MediaLibrary.tsx` previously fetched every `cms_media` row in one
unbounded query with no search or filter. Added, server-side (never client-side filtering of an
unbounded fetch):

- **Search** — a debounced (300ms) filename search (`ilike("filename", "%term%")`).
- **Filter** — All / Images / Recent segmented control (`Images` filters `mime_type ilike
  'image/%'` — currently a no-op today since every upload is already image-only per
  `ALLOWED_TYPES`, kept for forward-compatibility if non-image types are ever allowed; `Recent`
  filters to the last 30 days).
- **Pagination** — `PAGE_SIZE = 40`, `.range(page * PAGE_SIZE, ...)`, with a "Load more" button
  appending the next page rather than replacing the list. `hasMore` is derived from whether the
  last page returned a full `PAGE_SIZE` batch — no separate count query needed.

No folders/tags/DAM system added (explicitly out of scope) — existing upload/delete/reference-
safety (`find_media_references`) behavior is completely unchanged.

### Responsive preview breakpoint mapping (documented, not changed)

The new spec suggested Tablet = 820px (vs. the existing `PreviewFrame.tsx`'s 768px). Audited
against the ACTUAL breakpoint that governs the one component most sensitive to this — `Header.tsx`'s
hamburger-vs-desktop-nav switch is `lg:hidden`/`hidden lg:flex`, i.e. Tailwind's `lg` = **1024px**
(confirmed in `tailwind.config.js`; `sm/md/lg/xl` = 640/768/1024/1160). Neither 768px nor 820px
crosses that specific breakpoint — a "Tablet" preview at either width shows Header's hamburger, not
its desktop nav, because real tablets in this app's actual production design also see the hamburger
(the desktop nav only appears at genuine desktop widths, ≥1024px) — this is normal, expected
behavior, not a preview bug. **768px was kept, not changed to 820px**, because 768px genuinely
crosses real breakpoints elsewhere that DO matter for other components (Tailwind's `md`, e.g.
`Header`'s own inline search box is `hidden md:flex`) — 820px does not align with any configured
breakpoint (640/768/1024/1160/1280) at all. Documented here per the spec's own ask ("map to current
storefront behavior... document exact mapping") rather than silently picking a number.

### Preview side-effect interceptor: confirmed scope, one adjacent note

Re-verified `PreviewFrame`'s click/submit interceptor covers every interactive element actually
used across the components mounted in previews (`ProductCard`, `PillTabs`, `HomeCategoryProductSection`,
`CategoryIconStrip`, `PromoBannerPair`, `VehicleShopSplit`, `Footer`'s `tel:`/`mailto:`/social
links) — all are real `a`/`button` elements. One adjacent, currently-harmless observation:
`GetInTouchBox.tsx`'s contact form fires `track("contact_started", ...)` from `onFocusCapture` (a
focus event, not a click or submit) — outside the interceptor's own scope by design (focus/change/
keydown handlers aren't neutralized, only click/submit). This is currently inert in every admin
preview only because `track()` independently no-ops on any `/admin`-prefixed route (see "Preview
analytics suppression" — confirmed unchanged, still checked first thing inside `track()`). No new
`StorefrontPreviewProvider`/`isPreview` context was added to close this: the only currently-known
side effect this gap could theoretically expose is already covered by that separate safety net, and
no component in this codebase puts a real mutation (Supabase write, `navigate()`) behind a
non-click/non-submit handler — adding a second, unused abstraction now would be complexity without
a concrete case to justify it. Flagged here so a FUTURE component doing that isn't assumed safe by
default.

### Homepage's 3-pane grid below `lg` (confirmed, not changed)

`Homepage.tsx`'s `grid lg:grid-cols-[280px_1fr_360px]` has no `sm:`/`md:` override, so below `lg`
(1024px) it falls back to Tailwind's implicit single column — Navigator, Preview, and Inspector
stack vertically in DOM order, each full-width. This satisfies the spec's actual bar ("do not
squeeze 3 columns into 390px") without squeezing anything, though it is a plainer experience than a
tabbed mobile-Admin layout (one of the spec's own suggested options, not its only one) — left as a
known simplification rather than building a second, tab-based responsive layout for a page that is,
in practice, edited from a desktop-sized Admin browser.

## Second follow-up pass (2026-10-02): another near-duplicate 75-section spec

A third spec for this same overall phase arrived (same structure/numbering as the one handled in
the first follow-up above — shared visual-editor shell, real previews, responsive modes, undo/redo,
unsaved-change protection, media focal positioning). Its own "expected findings" section again
described a pre-existing-gap state that was, by this point, already closed. Per the established
pattern: re-audited the CURRENT code directly (not the spec's own assumptions) before changing
anything, confirmed the large majority of the 75 items were already correctly implemented (shared
shell, real previews for every editor, Desktop/Tablet/Mobile modes, section navigator with status
dots, per-device focal point/zoom with reset, `beforeunload` scoped to dirty state, in-app
navigation interception, analytics suppression on `/admin*`, Media Library search/filter/
pagination), and found three genuine, previously-unexamined gaps — all three closed this pass.

### 1. Undo history wasn't coalesced — one frame per keystroke (closed)

`useUndoRedo.ts`'s `set()` pushed a new history entry on every call, and every editor's text-field
`onChange` called `set()` directly — so typing a 20-character heading created 20 undo steps, each
reverting one character. Fixed entirely inside `useUndoRedo.ts` (no editor file needed to
distinguish "text" from "discrete" fields): `set(next)` still updates `value` synchronously every
call (the preview still reflects every keystroke live), but the actual push onto the `past` stack
is now debounced (500ms) — rapid-fire calls within that window share one history frame, captured
from the value *before* the whole burst started. `undo()`/`redo()` both flush any pending burst
first, so hitting Undo mid-burst always reverts the in-progress edit as its own step before
considering anything older. A discrete action (an image picked, a toggle flipped, a drag-reorder)
that happens to land inside another field's 500ms typing window now also coalesces with it — an
accepted, minor trade-off for not having to touch every field's `onChange` individually across 8
editor files.

### 2. Undo could silently rewind past a successful Save (closed — a real bug, not just UX polish)

None of the 8 editors reset undo history after a successful Save Draft — only `dirty` was cleared.
Concretely: save, then click Undo — content reverted to the pre-save value, but `dirty` stayed
`false` (nothing in `undo()` sets it), so the editor looked clean while actually holding unsaved,
reverted content; navigating away at that point lost the revert silently, with no warning. Fixed by
calling the hook's own `setWithoutHistory(savedValue)` right after every successful save (an
intentional no-op on `value` itself — it's already equal — but it clears `past`/`future`, making
the just-saved state the new baseline Undo can't go earlier than) in `HomeSectionEditor.tsx`,
`Homepage.tsx`, `Hero.tsx`, `Announcement.tsx`, `Navigation.tsx`, `Footer.tsx`, and `Seo.tsx`.
`Promotions.tsx` didn't need this — its editing panel fully unmounts on save (`setEditingId(null)`),
so there is no stale-undo-after-save window to close there.

### 3. Native `window.confirm()` replaced with a custom dialog (closed)

The spec explicitly asked for a styled "Keep Editing / Discard Changes" dialog in place of the
browser's own unstylable `confirm()` popup. Added two new shared primitives:

- `src/admin/components/AdminConfirmDialog.tsx` — a small centered `role="alertdialog"` modal,
  focus-trapped/restored on the same pattern as the existing shared analytics `Drawer`
  (`src/admin/analytics/ui.tsx`), Escape/backdrop-click both resolve as Cancel.
- `src/admin/hooks/useConfirmDialog.tsx` — a promise-based `confirm(message): Promise<boolean>` +
  `dialog` JSX pair, so a call site reads almost exactly like the `window.confirm()` it replaces
  (`if (await confirm("…")) { … }`), just async.

`src/admin/hooks/useUnsavedChangesGuard.ts` → `.tsx` (now returns JSX, so it needed the extension
change) was rewritten to use its own internal confirm dialog + `useNavigate()` for the in-app
same-route-leave case, instead of a synchronous `window.confirm()` blocking the click handler — the
native `beforeunload` path is unchanged (browsers always show their own chrome there regardless of
any custom message, so there is nothing to swap in for that specific case). Every one of the 8
editors now captures and renders this hook's return value (`const guardDialog =
useUnsavedChangesGuard(dirty); …return <>…{guardDialog}</>`) — a hook's returned JSX has no effect
unless something in the tree actually renders it, so this one-line addition was required at every
call site. The other 3 native-`window.confirm()` call sites — `Homepage.tsx` (switching sections
with unsaved edits, publishing with unsaved edits), `Seo.tsx` (switching routes with unsaved edits),
`Promotions.tsx` (canceling an in-progress edit) — each gained their own `useConfirmDialog()`
instance and now `await confirm(...)` instead.

### Verified, not changed (confirmed via direct code read this pass)

- `track()` (`src/lib/analytics/client.ts`) already short-circuits on any `/admin`-prefixed path
  (`isAdminRoute()`, checked first inside `track()`) — no admin preview can ever emit real
  storefront analytics. No `StorefrontPreviewProvider`/`isPreview` context exists or was added;
  this single guard already covers every component mounted in any preview.
- Hero has no CMS-editable image at all (its car/bike/accessory photography is a fixed, non-CMS
  composition — see `Hero.tsx`'s own doc comment) — so per-device focal-point/zoom framing
  (`ImagePositionControl`) correctly doesn't apply there; it's wired up for Promotions only, which
  is the one place this project actually has a swappable, CMS-owned full-bleed photo. Not a gap.
- `ImagePositionControl` already supports per-device (`desktop`/`tablet`/`mobile`) focal X/Y + zoom
  + per-device reset, backed by range sliders rather than requiring the admin to type a raw decimal
  — it does not offer literal click-and-drag-on-the-image positioning (the spec's own mockup
  showed a draggable crosshair over the image). Treated as a minor, non-blocking UX enhancement for
  a future pass, not implemented this time — sliders already satisfy the functional requirement
  ("Admin should not need to type `0.57`").

### Playwright / screenshots this pass

`npx playwright test tests/interaction/admin-panel.spec.ts --project=interaction` was run to check
whether the environment-level `networkidle` hang noted in the first follow-up pass still
reproduces — it does not: the dev server started and the suite completed within ~40 seconds this
time (all 8 tests correctly self-skip, since they require `ADMIN_TEST_EMAIL`/`ADMIN_TEST_PASSWORD`,
which aren't available to this session). **No live authenticated browser click-through or
screenshots were captured this pass** — same honest limitation as every prior pass, for the same
reason (no admin test credentials in this session's environment), not a regression introduced here.

## Add/Duplicate/Remove Section assessment (recommendation only — no code, per explicit instruction)

**Remove Section** already has a real, safe equivalent: the existing visibility hide/show toggle.
True row deletion (removing a `cms_sections` row, cascading to its drafts/published rows) would be
a one-way data-loss operation with no real business need identified yet — not recommended without a
specific request and an "are you sure" confirmation flow of its own.

**Add/Duplicate Section remain a real architectural blocker**, not a time-boxing choice (confirmed
again this pass, unchanged from the prior audit): every section key is hard-wired to one specific
JSX block inside `Home.tsx`'s render, and `cms_sections` has a `unique (page_id, section_key)`
constraint — there is no generic "renderer for an arbitrary new/duplicated section type." Building
real support would require:

1. A generic "custom content block" renderer in `Home.tsx` (or a registry keyed by `section_type`
   rather than a hard-coded `section_key`), so a NEW section key can render something meaningful.
2. Relaxing or reworking the `unique (page_id, section_key)` constraint (or generating a synthetic
   key like `promo-banners-2` at duplicate-time) so two rows of the same `section_type` can coexist.
3. Deciding what a "duplicate" of e.g. `vehicle-shop-split` even means visually on a real homepage —
   this is a product/design decision, not just an engineering one.

**Recommendation**: treat this as its own separately-scoped feature (a real "dynamic section" system
is explicitly out of scope for this entire phase per the user's own instruction), not a quick
follow-up — it touches the live homepage's rendering contract, not just the admin.

## Interfaces / data

- `PreviewFrame` — no prop changes; content wrapper now has `onClickCapture`/`onSubmitCapture`.
- `Footer({ contentOverride?: FooterCmsContent })`, `FooterCmsContent` now exported.
- `Header({ contentOverride?: HeaderContentOverride, previewMobileMenuOpen?: boolean })`,
  `HeaderContentOverride = { announcement?: AnnouncementContentOverride; navItems?: NavItemContent[] }`,
  `NavItemContent` now exported.
- `useUndoRedo<T>(initial)` — same return shape, now also attaches keyboard shortcuts internally.
- `EditorToolbar({ dirty, canUndo, canRedo, onUndo, onRedo, children? })`.
- `SectionInspector({ sectionKey, content, onChange })`, plus exported `sectionFields`/
  `PRODUCT_TABS` config (moved from `HomeSectionEditor.tsx`, same shape).
- `FullHomePreview({ sections: CmsSectionRow[], selectedSectionId, previewBreakpoint })`.
- `HomeSectionPreview` gained an optional `previewBreakpoint?: Breakpoint` prop.
- `PromoBannerPair`, `PromoBannerContent` — unchanged shape (already supported focal point before
  this phase); this phase only fixed callers that weren't populating those fields.
- New Postgres: `private.app_config`, `private.admin_mfa_satisfied()` — see
  `delite-auth-security.md` for the full MFA-hardening interface list (not repeated here).
- New shared Edge Function helper: `supabase/functions/_shared/auth/requireAdmin.ts` — see
  `delite-auth-security.md`.
- `AdminConfirmDialog({ open, title, message, confirmLabel?, cancelLabel?, onConfirm, onCancel })`.
- `useConfirmDialog()` → `{ confirm(message, opts?): Promise<boolean>; dialog: ReactNode }`.
- `useUnsavedChangesGuard(dirty)` — unchanged signature, now returns `ReactNode` (the discard
  dialog, or `null`) that every caller must render; previously returned `void`.
- `useUndoRedo<T>(initial)` — same return shape; `set()`'s history push is now debounced/coalesced
  (500ms) instead of immediate; added no new public method (the internal `flush()` is not exported).

## Dependencies

None new — every primitive is built from existing React/Tailwind/lucide-react/Supabase patterns
already used throughout this admin and this project's Edge Functions.

## Testing / verification

- `npm run build` / `npm run lint` / `npm run typecheck:server` / `npm run test:unit` (106
  passed, 1 skipped) — all clean after every change in this phase, re-run multiple times as work
  progressed.
- Confirmed `Layout.tsx` (the real storefront) still calls `<Header />`/`<Footer />` with zero
  props — the new `contentOverride`/`previewMobileMenuOpen` props are strictly additive and cannot
  change real storefront behavior.
- `mcp__supabase__get_advisors` (security + performance), re-run after the MFA migration and all 8
  Edge Function redeploys — zero new findings; `private.app_config` confirmed to have no
  `anon`/`authenticated` grants via a direct `information_schema.role_table_grants` query (reachable
  only through the `SECURITY DEFINER` RLS helper and the service-role Edge Function client).
  `private.admin_mfa_satisfied()` confirmed to return `true` while the flag is off — zero behavior
  change confirmed directly, not assumed.
- **Not done this pass**: a live/interactive browser click-through. `npx playwright test` was
  attempted (`tests/interaction/cart-drawer.spec.ts`, `tests/visual/home.spec.ts`) but every test
  timed out inside `page.waitForLoadState("networkidle")` — direct Node `fetch()` to both a generic
  host and this project's actual Supabase URL succeeded in the same session, so this is not a
  simple "no network egress" block; it appears specific to the spawned Playwright browser process
  in this sandboxed environment and was not root-caused further given the time budget. This is
  almost certainly an environment characteristic, not a regression from this phase's diff (nothing
  changed touches cart-drawer logic or the Home page's own data-fetching), but is stated honestly
  rather than assumed. The MFA on/off toggle test sequence described in the plan (flip
  `require_admin_mfa` to `'true'`, confirm an AAL1 admin call gets `403 mfa_required`, an AAL2 call
  succeeds, Security stays reachable either way, then flip back off) was likewise not run
  interactively this pass for the same reason — the migration's own direct-SQL verification above
  (the function correctly returns `true`/is a no-op while off) is the verification that was
  actually performed.

## Known issues / follow-ups

- No live browser click-through this pass either (2026-10-02) — `ADMIN_TEST_EMAIL`/
  `ADMIN_TEST_PASSWORD` aren't available in this session; confirmed the Playwright harness itself
  runs cleanly now (no more environment-level `networkidle` hang), but every admin-panel test still
  self-skips without those credentials.
- `ImagePositionControl` uses range sliders, not literal click-and-drag-on-the-image positioning —
  functionally complete (per-device X/Y/zoom/reset, no typed decimals required) but not a pixel-
  perfect match to the spec's own crosshair-drag mockup; flagged as a future UX enhancement, not
  built this pass.
- No live browser click-through this pass (see Testing above) — every change is verified by
  build/lint/typecheck/unit + direct SQL/advisor checks, not a driven browser session.
- The MFA toggle-on test sequence (flip the flag, confirm 403 on AAL1, confirm AAL2 still works,
  flip back off) was not run live this pass; the flag remains off in the live project.
- Add/Duplicate/Remove Section: assessed only, not built (see the dedicated section above) — a
  real architectural blocker, recommended as its own separately-scoped follow-up.
- Homepage's Inspector pane shows Hero as a summary + link rather than an inline form — a
  deliberate scope decision (see Scope), not a gap to close later without a specific request.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-02 | Claude | Second follow-up pass against another near-duplicate 75-section spec for this same phase. Re-audited current code directly (most of the spec was already implemented, confirmed by direct read, not assumed) and closed 3 genuine gaps: `useUndoRedo.ts` now debounces/coalesces rapid `set()` calls into one history frame per ~500ms burst instead of one per keystroke (`undo()`/`redo()` flush any pending burst first); every editor now resets its undo baseline (`setWithoutHistory(savedValue)`) immediately after a successful Save Draft, fixing a real bug where Undo could silently rewind past a save without `dirty` ever flipping back to `true`; native `window.confirm()` replaced with a new shared `AdminConfirmDialog`/`useConfirmDialog()` (promise-based, focus-trapped, Keep Editing/Discard Changes) across all 5 call sites (`useUnsavedChangesGuard`'s in-app route-leave guard, `Homepage.tsx` ×2, `Seo.tsx`, `Promotions.tsx`) — `useUnsavedChangesGuard.ts` became `.tsx` since it now returns JSX every caller must render. Confirmed and left unchanged: analytics suppression on `/admin*` already correct, Hero correctly has no focal-point UI (no CMS-editable image exists there), `ImagePositionControl`'s slider-based (not drag-on-image) UI. `tsc`/lint/build/unit (113 passed/1 skipped) all clean. Playwright harness confirmed no longer hangs in this environment, but a live authenticated click-through/screenshots remain blocked by missing admin test credentials — same honest gap as every prior pass. |
| 2026-09-30 | Claude | Initial version — PreviewFrame click/submit interceptor, real Header/Footer previews (contentOverride props), PromoBannerPair focal-point gap closed in HomeSectionPreview, undo/redo keyboard shortcuts, shared EditorToolbar (all 7 editors), shared SectionInspector, Homepage rebuilt into a 3-pane navigator/preview/inspector editor, MFA backend hardening (private.app_config, admin_mfa_satisfied() RLS helper, shared requireAdmin() Edge Function helper applied to 7 functions + review-notify), Security page status card. Add/Duplicate/Remove Section assessed only, per explicit instruction. |
| 2026-09-30 | Claude | Follow-up pass against a second, more detailed 75-section spec for the same phase (its own audit section described pre-this-work state, already stale on arrival). Re-audited current code directly instead of re-implementing; found and closed two genuine gaps: Media Library gained server-side filename search, an All/Images/Recent filter, and real range-based pagination with "Load more" (previously fetched every row unbounded); documented (rather than changed) the Desktop/Tablet/Mobile breakpoint mapping against the actual Tailwind config and Header's real `lg` (1024px) nav-switch breakpoint — 768px kept over the spec's suggested 820px since 820 doesn't align with any configured breakpoint at all. Also confirmed and documented: the click/submit interceptor's real coverage across every component actually mounted in previews, one adjacent (currently-harmless) focus-event gap in GetInTouchBox, and Homepage's plain single-column stack below `lg`. Build/lint/typecheck:server/unit (113 passed/1 skipped, +7 new tests from a concurrent session's jwt.test.ts) clean. |
