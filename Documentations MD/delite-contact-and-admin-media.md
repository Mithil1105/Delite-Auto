# Contact Form + Admin Inbox, Media Delete Safety, Activity Log Filters, Appearance Label

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Real contact-form backend + Admin inbox, media-delete reference safety + picker, Activity Log filters/export/actor names, "Admin Appearance" label clarity |
| File           | `Documentations MD/delite-contact-and-admin-media.md` |
| Branch         | figma |
| Owner          | Claude |
| Status         | Done |
| Created        | 2026-09-29 |
| Last updated   | 2026-09-29 |

## Summary

Four related "Delite Admin quality-of-life / real backend" fixes from the same phase as
`delite-payments.md`: (1) the public Contact form, previously 100% decorative (no field was ever
read, submit just showed a fake success card), now really submits to a rate-limited backend and
lands in a real Admin inbox; (2) the Media Library's delete button, previously an unconditional
one-click delete, now checks real CMS references first; (3) a new reusable `AdminMediaPicker`
replaces raw storage-path text inputs across CMS editors; (4) Activity Log gained real
filters/pagination/CSV export and actor names (previously a raw UUID, hard `limit(100)`, no
filters at all); (5) the Admin "Settings" page/label, which only ever changes the Admin panel's own
skin, is now unambiguously labeled "Admin Appearance."

## Why

Audited directly (not assumed) before building anything, per this phase's own instruction: the
audit confirmed `ContactForm.tsx` never sent field data anywhere, no `contact_enquiries` table
existed at all, the Media Library's `onRemove` had no reference check, every CMS image field was a
raw text input with no picker anywhere in the codebase, and Activity Log had zero filters despite a
hard 100-row cap. Fixed as found.

## Scope

**In scope:** `contact-submit` Edge Function (rate-limited, service-role, honeypot) +
`contact_enquiries` table; real `ContactForm.tsx` (controlled inputs, honeypot, loading/error
states); `/admin/contact` real inbox (list/filter-by-status/detail/status-transition — flipped from
placeholder to active); `find_media_references` RPC + a confirm-before-delete modal in
`MediaLibrary.tsx`; `AdminMediaPicker`/`AdminMediaField` reusable components, wired into
`Promotions.tsx` (image + mobile image) and `AdminCategoryPicker.tsx` (per-category image);
`ActivityLog.tsx` date-range/actor/action filters, server-side pagination, CSV export, real actor
names (via the existing `admin_activity_log.actor_id → profiles` FK); `Appearance.tsx`'s
heading/subtitle and its `ADMIN_NAV` label both clarified to "Admin Appearance."

**Explicitly not in scope:** a full CRM for Contact Enquiries (list/filter/detail/status only, per
explicit instruction); scheduled internal-notification emails on new enquiries (the shared email
service exists — see `delite-transactional-email.md` — but nothing wires a contact-enquiry
notification through it this pass); a storefront theme builder (Appearance stays Admin-only, by
design, not expanded).

## Contact form audit result (#35)

`src/components/ContactForm.tsx` (pre-existing): every input was **uncontrolled** (no `value`/
`onChange`), `onSubmit` only called `e.preventDefault()`, fired an analytics event, and set local
`sent` state — field values were never even read into JS, let alone sent anywhere. No
`contact_enquiries` (or similarly named) table existed in any migration.

## Contact Enquiries table (#36) / submission (#37)

`public.contact_enquiries` — `id, user_id (nullable), name, email, phone, subject, message, status
('new'|'in_progress'|'resolved'|'archived'), created_at, updated_at`. **No client INSERT RLS
policy exists at all** — Postgres RLS cannot rate-limit, so the table is reachable only through the
`contact-submit` Edge Function (service-role), which has a real in-memory per-IP rate limiter
(3 submissions/minute, same pattern already used by `analytics-track`'s own limiter) plus a
honeypot field (`website`, visually hidden off-canvas via CSS, `tabindex="-1"` so it's never
reachable by a real keyboard user — a filled value silently drops the submission while still
reporting success, never telling a bot it was caught). `ContactForm.tsx` is now fully controlled,
shows a real submitting/error state, and — when the visitor happens to be signed in — attaches their
session token so `user_id` gets linked (still submits fine, same as before, when signed out).

## Admin Contact inbox (#38)

`/admin/contact` (was `AdminPlaceholder`, now real) — a list filterable by status, a detail
panel (click a row), and three status-transition actions (In Progress / Resolved / Archived).
Deliberately not a CRM: no assignment, no threaded replies, no tagging beyond status — matches the
explicit "don't over-build" instruction.

## Contact notification (#39)

Not built this pass. The shared email service (`delite-transactional-email.md`) is ready to carry
an "new enquiry" internal notification, but no code path calls it yet — flagged as a natural,
easy follow-up once `RESEND_API_KEY` is actually configured, not assumed done.

## Media delete safety (#48-49)

`find_media_references(p_storage_path)` — a `SECURITY INVOKER` Postgres function (runs under the
calling admin's own RLS, same pattern as the existing `cms_publish_page()`) that searches
`cms_section_drafts`/`cms_section_published` content (jsonb cast to text, `LIKE` match — broad on
purpose: a false "still referenced" is safe, a false "safe to delete" is not) and `cms_promotions`'
`image_storage_path`/`mobile_image_storage_path` columns. `MediaLibrary.tsx`'s delete button now
opens a confirm modal listing every real reference found (source/status/label) before any deletion
happens — **blocked-by-default in spirit**: the destructive action requires an explicit second
click past the warning ("Delete anyway"), never a silent one-click delete when references exist.

## Media picker (#50)

New `src/admin/components/AdminMediaPicker.tsx` — `AdminMediaPicker` (a full browse/search/upload/
select modal over the same `cms_media` library the Marketing Media page manages) and
`AdminMediaField` (a compact preview + "Choose Image"/"Remove" control pairing a storage-path field
with that modal). Replaces the raw text inputs in `Promotions.tsx` (image + mobile image) and
`AdminCategoryPicker.tsx` (per-category image, using a compact inline trigger button instead of the
full field layout, to fit its dense per-row grid). `HomeSectionEditor.tsx`'s `carImage`/`bikeImage`
fields were confirmed to be genuine external-URL fields (`kind: "url"`), not Media-library storage
paths — left as plain URL inputs, correctly not converted to this picker.

## Activity Log improvements (#51) / CSV export (#52)

`ActivityLog.tsx` — date-range (`from`/`to`), actor-name substring filter, and action-substring
filter, all applied server-side (`.gte`/`.lte`/`.ilike` on the query, not a client-side filter over
an already-fetched page); real server-side pagination via `.range()` (50/page) instead of the old
hard `limit(100)` with nothing beyond it; actor names resolved via the existing
`admin_activity_log_actor_id_fkey` foreign key (PostgREST embedded resource select,
`actor:profiles!admin_activity_log_actor_id_fkey(full_name)`) instead of showing a raw UUID.
**CSV export** re-queries the same active filters (capped at 5000 rows, never a dump of only
whatever page happened to be loaded) and builds the file client-side — columns: timestamp, actor,
action, target_type, target_id, a truncated metadata summary. No secrets are ever exportable (the
underlying `metadata` column itself never receives credential-shaped values, per the log's own
existing write discipline — unchanged by this pass).

## Appearance label (#53)

`src/admin/pages/settings/Appearance.tsx`'s heading changed from "Admin Settings" to "Admin
Appearance," with an explicit subtitle clarifying it "changes how Delite Admin looks on this
browser only — the storefront your customers see is unaffected." The `ADMIN_NAV` sidebar entry
routing to it was similarly renamed from the generic "Settings" to "Admin Appearance." No
storefront-theme builder exists or is implied — this remains a two-option (Glass/Legacy) Admin-only
skin toggle, now labeled honestly.

## Interfaces / data

- `POST contact-submit` — public (rate-limited, honeypot), body `{ name, email, phone?, subject?,
  message, website? }` → `{ ok: true }` or `{ error }`.
- `public.contact_enquiries` — see `supabase/migrations/20260929090300_create_contact_enquiries.sql`.
- `public.find_media_references(p_storage_path text)` — returns `{ source, status, label }[]`.
- `AdminMediaPicker({ open, onClose, onSelect })`, `AdminMediaField({ label, value, onChange })`,
  `mediaPublicUrl(path)` — `src/admin/components/AdminMediaPicker.tsx`.

## Dependencies

None new — reuses the existing `marketing-media` Storage bucket, `cms_media` table, and
`admin_activity_log`'s existing FK.

## Testing / verification

- `npm run build`/`lint`/`typecheck:server`/`test:unit` — clean.
- `tests/interaction/commerce-completion.spec.ts`: a real end-to-end contact-form submission
  against the live `contact-submit` function (this one has no missing-provider-secret dependency —
  it only needs `SUPABASE_URL`/`SERVICE_ROLE_KEY`, already present — so unlike payments/email, this
  path was fully live-tested this session, not just unit-verified); the honeypot field's real
  off-screen position (`x < 0`) and `tabindex="-1"` are both asserted directly.
- Media-delete-safety, media-picker, Activity-Log-filter, and Admin-inbox flows were not driven
  through the real browser UI as the bootstrapped admin account this session (no interactive admin
  browser session was available) — code-reviewed and typechecked, matching the RLS/reference-check
  design described above, but not live-clicked-through. See "Media safety testing"/"Contact testing"
  below for the checklist to run against the real account.

## Known issues / follow-ups

- ~~Contact notification email not wired~~ — **resolved 2026-09-29**, see
  `Documentations MD/delite-production-operations.md` (`sendContactNotification`, optional
  `CONTACT_NOTIFICATION_EMAIL`, idempotent per enquiry, never blocks the enquiry save).
- **`find_media_references`'s jsonb-as-text `LIKE` match is a heuristic**, not a structured
  reference graph — it will find real references reliably (any storage path that appears in a
  section/promotion's JSON is matched) but can't distinguish "referenced" from "path appears in an
  unrelated field that happens to contain the same string," which is why deletion still allows an
  explicit override rather than hard-blocking.
- **Media-delete-safety, picker, Activity Log, and Admin inbox flows need a real click-through**
  against the bootstrapped admin account (see Testing above) — this session verified them by code
  review against the real schema, not by driving the actual browser UI.

## Contact testing (#69)

1. Valid enquiry: submit a real message via `/contact` → confirm it lands in `/admin/contact` with
   status `new` (automated this session — see Testing above).
2. Validation: submit with a missing/invalid email → confirm the client + server both reject it.
3. Rate-limit behavior: submit 4+ times within a minute from the same IP → confirm the 4th is
   rejected with 429.
4. Admin inbox: confirm status transitions (New → In Progress → Resolved/Archived) persist and the
   filter tabs reflect them.
5. Permission denial: confirm a `content`/`merchandising`/`analytics`-role admin cannot reach
   `/admin/contact` (not in that role's allowed set).

## Media safety testing (#70)

1. Unreferenced deletion: delete an image with zero CMS references → confirm the "no references
   found" message and a normal single-click-to-confirm delete.
2. Draft-referenced media: reference an image only in a draft (never published) → confirm the
   warning lists it as `draft`.
3. Published-referenced media: publish that reference → confirm the warning now lists it as
   `published`, still requires the explicit override to delete.
4. Replacement: use `AdminMediaField`'s "Change Image" to swap a promotion's image → confirm the
   draft updates correctly and the old image (if now unreferenced) can then be deleted cleanly.
5. Permission denial: confirm a non-content-role admin can't reach the Media Library route at all
   (unchanged `ADMIN_NAV` role gating).

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-29 | Claude | Initial version — real contact-submit Edge Function + contact_enquiries table + real Admin inbox (replacing a fully decorative form and a placeholder page), find_media_references RPC + confirm-before-delete modal in Media Library, reusable AdminMediaPicker/AdminMediaField (replacing raw storage-path text inputs in Promotions and Homepage Categories), Activity Log real filters/pagination/CSV export/actor names, "Admin Appearance" label clarity. |
| 2026-09-29 | Claude | Production-ops phase — wired the internal contact-notification email (`sendContactNotification`). Confirmed the Admin inbox's existing detail modal already covers name/contact/message/status/timestamps + Mark In Progress/Resolve/Archive — no change needed there. Full detail in `Documentations MD/delite-production-operations.md`. |
