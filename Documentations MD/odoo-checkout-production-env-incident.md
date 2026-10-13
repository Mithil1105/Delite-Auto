# Production Checkout Incident: Missing Vercel Build-Time Env Vars

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Production checkout handoff failure — missing Vercel env vars |
| File           | `Documentations MD/odoo-checkout-production-env-incident.md` |
| Branch         | main |
| Owner          | Claude |
| Status         | Root cause confirmed and documented; fix is a Vercel dashboard config change (not a code change) — see Known issues for live deployment/verification status |
| Created        | 2026-10-10 |
| Last updated   | 2026-10-10 |

## Summary

After `feature/odoo-checkout` merged to `main` (see [odoo-native-checkout.md](odoo-native-checkout.md)),
every product in the live production cart failed Checkout with `"<product>" can't be sent to
checkout — please remove and re-add it.` The React → Odoo handoff code itself was correct and
worked on localhost; production was missing two build-time Vite env vars in Vercel, so production
builds silently ran on the local mock catalog instead of the real Odoo-backed one.

## Why

A real customer-facing production outage: Checkout was completely unusable for every product,
with no code regression involved. Documenting it so (a) the next person diagnosing a similar
"works on localhost, fails for every item in production" report has a fast first check, and (b)
the missing-env-var class of failure gets a permanent record, since it left no trace in git
history or test output — `npm run build`/`lint`/`typecheck:server`/`test:unit` and even the
Playwright interaction suite all passed cleanly for the PR that introduced this, because none of
those run against a real Vercel production build with production env vars.

## Scope

**Included:** root-cause diagnosis, the env var fix, verification steps, rollback/troubleshooting
notes, and a hardening recommendation.
**Not included:** no changes to checkout logic, product/catalog code, Odoo integration code, or
Razorpay/payment code — this incident required zero code changes.

## Symptom

- Production (`www.deliteauto.com`, served by the Vercel `deliteauto` project): clicking Checkout
  on **any** product in the cart (confirmed across multiple distinct products) immediately failed
  with: `"<product name>" can't be sent to checkout — please remove and re-add it.`
- Removing and re-adding the product to the cart did **not** fix it — ruling out a stale/cached
  cart-line data problem.
- Localhost (same code, same commit): the identical flow worked — the handoff built a correct
  payload and the browser navigated to `${VITE_ODOO_CHECKOUT_BASE_URL}/checkout/handoff#<payload>`.

## Root cause

[`src/lib/odooCheckoutHandoff.ts`](../src/lib/odooCheckoutHandoff.ts)'s `buildHandoffPayload()`
throws that exact message when a cart line's `product.odooId` (the Odoo `product.template` id) is
not a positive integer:

```ts
const templateId = line.product.odooId;
if (typeof templateId !== "number" || !Number.isInteger(templateId) || templateId <= 0) {
  throw new HandoffValidationError(`"${line.product.name}" can't be sent to checkout — please remove and re-add it.`);
}
```

`product.odooId` is populated by whichever `CatalogService` implementation is active, selected at
**build time** by `VITE_CATALOG_SOURCE` (`src/services/catalog/catalogService.ts`):

```ts
function resolveCatalogService(): CatalogService {
  const source = import.meta.env.VITE_CATALOG_SOURCE;
  if (source === "supabase") return supabaseCatalogService; // real Odoo-backed data, real odooId
  if (source === "http") return httpCatalogService;
  return mockCatalogService; // local src/data/products.ts — never sets odooId
}
```

Vercel's `deliteauto` project (production + preview) had **only** `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` configured. `VITE_CATALOG_SOURCE` was never set, so every
production build silently fell back to `mockCatalogService`, whose product data
(`src/data/products.ts`) never sets `odooId` at all (confirmed: zero matches for `odooId` in that
file). Every cart line's `product.odooId` was therefore `undefined` for every product — matching
the "all products fail, re-adding doesn't help" symptom exactly, since re-adding still reads from
the same mock catalog.

`VITE_ODOO_CHECKOUT_BASE_URL` was also missing from Vercel. It wasn't yet visible as a separate
symptom because `buildHandoffPayload()` throws on the invalid `odooId` before
`buildOdooHandoffUrl()` ever reaches the code that reads it — but it would have produced a second,
immediate failure ("Checkout is temporarily unavailable — please try again shortly.") once the
catalog-source issue was fixed, had it not been fixed at the same time.

## Why localhost worked / production failed

Vite inlines every `import.meta.env.VITE_*` reference into the built JS bundle **at build time**
— there is no runtime env lookup in the browser. `.env.local` (gitignored, present only on the
developer's machine) already had both values:

```
VITE_CATALOG_SOURCE=supabase
VITE_ODOO_CHECKOUT_BASE_URL=https://www.deliteauto.com
```

Vercel's project-level environment variables are the production/preview equivalent of `.env.local`
— nothing reads `.env.local` in a Vercel build. Because the two vars were only ever set locally,
every local `npm run dev`/`npm run build` picked them up and every Vercel-built deployment did not.
This is not a config drift that happened recently — it was true from the first Vercel deployment
of this project (confirmed: `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` were added
2026-09-17; `VITE_CATALOG_SOURCE`/`VITE_ODOO_CHECKOUT_BASE_URL` were never added at any point).
Checkout simply had no code path exercising `odooId` end-to-end in a way that surfaced this until
the Odoo-native handoff shipped and started reading it.

## Ruled out (investigated and eliminated before reaching the above)

- **Stale Vercel deployment**: the live production deployment's `githubCommitSha` matched
  `origin/main`'s HEAD exactly at the time of investigation — not a deployment lag issue.
- **Odoo-side failure**: `www.deliteauto.com/checkout/handoff` was separately observed returning a
  500 (an unrelated, already-documented issue in the manually-pasted Odoo Embed Code page — see
  [odoo-native-checkout.md](odoo-native-checkout.md)) — but that page is never reached at all for
  this failure, since `buildHandoffPayload()` throws before any navigation is attempted.
- **CORS / resolver network failure**: the error message that fires on a catalog-lookup failure
  (`resolveDefaultVariantId`) is worded differently ("...can't be sent to checkout **right now**
  — please remove and re-add it.") — the production error lacked "right now", pointing directly at
  the `templateId` check instead, which was confirmed by reading the two call sites.
- **Code regression in the merged branch**: `feature/odoo-checkout`'s own 11 commits never touched
  `odooId` population, `catalogService.ts`, or any mock catalog data — confirmed via
  `git diff --stat figma..feature/odoo-checkout -- src/data src/services/catalog`.

## Required Vercel configuration

Project: `deliteauto` (Vercel project id `prj_0LZ9uIAVNomx7uMl6XX8FATRRxXC`).

| Key | Value | Target |
|-----|-------|--------|
| `VITE_CATALOG_SOURCE` | `supabase` | Production, Preview |
| `VITE_ODOO_CHECKOUT_BASE_URL` | `https://www.deliteauto.com` | Production, Preview |

(`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` were already correctly configured and are
unaffected by this incident.)

**Critical: a Vercel env var change does not retroactively affect an already-built deployment.**
Vite bakes `VITE_*` values into the static JS bundle at build time, not read at request time —
adding/editing the variables in the Vercel dashboard only takes effect on the **next** build. A
fresh deployment (new commit push, or a manual redeploy of the current commit) is required after
changing these for the fix to actually reach production.

## Verification steps

1. Confirm the two env vars are present in Vercel → Project Settings → Environment Variables, with
   `Target` including **Production** (and Preview, for parity with `.env.local`).
2. Trigger a fresh deployment (any new commit to `main`, or a manual redeploy) — confirm the
   deployment's built commit SHA matches `origin/main`'s current HEAD.
3. Once that deployment is `READY`, load the production site and add a real product to the cart.
4. Open the browser's network/console tooling and click Checkout — confirm:
   - No `"...can't be sent to checkout..."` error.
   - The browser performs a real navigation to
     `https://www.deliteauto.com/checkout/handoff#<payload>` (not a 4xx/validation failure before
     navigation).
5. Decode the URL fragment (`decodeURIComponent` + `JSON.parse`) and confirm `lines[].productId` /
   `lines[].productTemplateId` are real positive integers, not `undefined`/`0`.
6. Repeat with at least 2–3 different products (different categories/brands) to confirm the fix
   isn't product-specific.
7. Do **not** submit payment as part of this verification — stop once the handoff navigation and
   payload are confirmed correct.

## Troubleshooting / rollback notes

- If Checkout still fails with the same message after redeploying, first re-check that the
  deployment that's actually serving traffic (not just the latest "Ready" build — confirm via the
  Vercel dashboard's Production alias) was built **after** the env vars were saved, since a build
  already in progress when the vars are added will not pick them up.
- If the failure message changes to `"...can't be sent to checkout right now..."` (note "right
  now"), that's a different failure mode — the catalog source is now correct, but
  `resolveDefaultVariantId()`'s live catalog lookup (via `supabaseCatalogService` → Supabase Edge
  Function → Odoo) is failing or returning zero/multiple variants for that product. That needs its
  own investigation; it is not this incident.
- If Checkout instead fails with `"Checkout is temporarily unavailable — please try again
  shortly."`, `VITE_ODOO_CHECKOUT_BASE_URL` is still missing or empty in the build that's live.
- Rollback: this fix has no code/migration component to roll back. If a regression is suspected,
  the two env vars can simply be removed/reverted in Vercel and a new build triggered — there is no
  application-code dependency on them being present (the mock catalog is a graceful, intentional
  fallback for local development, not a code path that needs removal).

## Hardening recommendation (future follow-up, not yet implemented)

**Production should not be able to silently run on the mock catalog at all.** Today,
`resolveCatalogService()` falls back to `mockCatalogService` whenever `VITE_CATALOG_SOURCE` is
unset or misspelled, with no warning anywhere — this is the entire reason the incident reached
production undetected through every automated gate (build/lint/typecheck/unit tests/Playwright all
run with their own correctly-configured env and never exercise a misconfigured-production
scenario).

A safe, additive hardening (deliberately not implemented in this pass, since the user's explicit
instruction for this task was documentation-only, no code changes):
- At minimum, have the mock-catalog fallback path `console.warn()` loudly when
  `import.meta.env.PROD` is true and `VITE_CATALOG_SOURCE` is not explicitly `"mock"` (i.e., it's
  unset/missing rather than deliberately chosen) — turning a silent fallback into something that
  shows up in Vercel's runtime/browser error monitoring if one exists.
- A stronger option: fail the production **build** itself (throw in `catalogService.ts` or a
  small Vite config check) if `import.meta.env.PROD` is true and `VITE_CATALOG_SOURCE !==
  "supabase"` — turning this entire class of incident into a build failure instead of a silent
  runtime behavior change. This is a deliberate product/ops decision (it would also block a
  legitimate "ship a production build on the mock catalog" scenario, if one is ever wanted) and
  should be confirmed with the project owner before implementing, not assumed.

## Interfaces / data

No code, schema, or API changes. Purely Vercel project-level configuration (`VITE_CATALOG_SOURCE`,
`VITE_ODOO_CHECKOUT_BASE_URL`).

## Dependencies

Depends on the existing `supabaseCatalogService` / Supabase Edge Function catalog path
([odoo-real-catalog.md](odoo-real-catalog.md)) and the Odoo-native checkout handoff
([odoo-native-checkout.md](odoo-native-checkout.md)) already being correctly built — this incident
is purely about which of the already-built catalog implementations production selects.

## Testing / verification

See "Verification steps" above. Note explicitly: this class of bug is **not** caught by this
repo's existing `npm run build`/`lint`/`typecheck:server`/`test:unit`/Playwright gates, because all
of them run against a locally/CI-controlled env (`.env.local` or `.env.interaction`), never against
Vercel's actual production environment variables. Closing that gap is the hardening item above.

## Known issues / follow-ups

- The build-fails-if-misconfigured hardening above is a recommendation only, not implemented in
  this pass — explicit instruction for this task was documentation only, no checkout/catalog code
  changes.
- Whether the Vercel env vars had already been added and a fresh deployment completed at the time
  this doc was written should be cross-checked against this doc's own revision log / the
  `index.md` entry's "Last updated" date and `odoo-native-checkout.md`'s status for the current
  live state — environment configuration can change independently of this document.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-10-10 | Claude | Initial version — documents the production checkout incident (missing `VITE_CATALOG_SOURCE`/`VITE_ODOO_CHECKOUT_BASE_URL` in Vercel), root cause, why localhost worked and production didn't, verification steps, troubleshooting/rollback notes, and a future hardening recommendation (fail the production build instead of silently falling back to the mock catalog). |
