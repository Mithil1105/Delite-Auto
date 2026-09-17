# Odoo Integration via Supabase Edge Functions

## Metadata

| Field          | Value                                   |
|----------------|------------------------------------------|
| Feature name   | Odoo integration moved behind Supabase Edge Functions |
| File           | `Documentations MD/odoo-supabase-edge-functions.md` |
| Branch         | figma                                   |
| Owner          | Claude (pairing with the user)          |
| Status         | `odoo-health` fully passing. Catalog Edge Functions built and verified (see `odoo-real-catalog.md`). Auth has since failed and recovered twice in production use — see "Operational note: API key rotation" below. Admin Edge Functions not started. |
| Created        | 2026-09-15                              |
| Last updated   | 2026-09-17                              |

## Summary

The Odoo credentials (`ODOO_BASE_URL`, `ODOO_DATABASE`, `ODOO_USERNAME`, `ODOO_API_KEY`) live in a
Supabase project (`delite-auto`, ref `zafjmlwbolgdattfdgch`), not in a local `.env` or Vercel —
this doc replaces the architecture described in `odoo-live-catalog-integration.md`
(Vercel serverless functions reading `process.env`) with:

```
React frontend → Supabase Edge Function (Deno.env.get reads the secrets) → Odoo
```

This pass deliberately stopped after step 1 of that migration: the repo is now linked to the
Supabase project, and a minimal `odoo-health` Edge Function is deployed and confirmed reachable —
but authentication is currently failing, so the rest of the catalog functions were **not** built
yet, per explicit instruction ("do not rewrite the whole catalog integration until the health
check succeeds").

## Why

Two prior sessions (see `odoo-live-catalog-integration.md`) built a complete Vercel-based Odoo
integration but could never verify it against a live instance — there was no reachable Odoo
credential set anywhere in this environment. The user has since stored real Odoo credentials as
Supabase secrets on a project they already had provisioned, and asked for the integration to read
them from there via Edge Functions instead of a local/Vercel `.env`, for two reasons stated
explicitly: the secrets must never enter `VITE_*`/browser code, and they don't want to paste raw
secret values into this session at all.

## Scope

**In scope (this pass):**
- Inspecting the repo for any pre-existing Supabase setup (found: none — no `supabase/`
  directory, no `@supabase/supabase-js` dependency, only `.mcp.json`'s reference to the project
  ref).
- Linking this repo to the `delite-auto` Supabase project via the CLI (`npx supabase link`).
- Building, deploying, and verifying the single smallest possible `odoo-health` Edge Function.

**Explicitly not in scope / not started (per "do not rewrite the whole catalog integration until
the health check succeeds" and "do not build admin yet")):**
- `odoo-schema` / introspection Edge Function.
- `catalog-products`, `catalog-product-detail`, `catalog-categories`, `catalog-media` Edge
  Functions.
- Removing/retiring the existing `api/catalog/*` Vercel functions or `server/odoo/*` Node code —
  both are left completely untouched. Nothing in `src/` was touched either — the frontend still
  calls `catalogService` exactly as before (`VITE_CATALOG_SOURCE=mock`), unaware any of this
  exists yet.
- Any admin tooling.

## Implementation notes

- **Pre-existing state, verified by direct inspection before changing anything** (per the
  instruction to inspect first): no `supabase/` directory, no `@supabase/supabase-js` dependency,
  no Supabase env vars anywhere in code or `.env.example`. The only trace of a Supabase project
  anywhere in the repo was `.mcp.json`'s MCP server URL, which contains
  `project_ref=zafjmlwbolgdattfdgch` — that turned out to be exactly the right project once
  confirmed against the account's actual project list (named `delite-auto`, created the same day
  as this task, `ACTIVE_HEALTHY`).
- **CLI**: not globally installed, but works via `npx supabase` (v2.117.0) and was already
  authenticated on this machine (`npx supabase projects list` succeeded without any login step) —
  no access token needed to be requested from the user.
- **Linking**: `npx supabase link --project-ref zafjmlwbolgdattfdgch` — created the local
  `supabase/` directory (currently just `supabase/.temp/` plus the one function below; no
  `config.toml` was needed for a plain function deploy with this CLI version).
- **Secrets verified present, never read**: `npx supabase secrets list --project-ref ...`
  confirms all four `ODOO_BASE_URL`/`ODOO_DATABASE`/`ODOO_USERNAME`/`ODOO_API_KEY` secrets exist
  on the project. This command only ever returns a hash of each value, never the plaintext — that
  hash was not recorded anywhere in this repo or repeated back to the user.
- **`supabase/functions/odoo-health/index.ts`** (new) — the only Edge Function built this pass.
  Reads all four secrets via `Deno.env.get(...)` (never `process.env`, which doesn't exist in the
  Deno runtime). Responds with exactly `{ configured, reachable, authenticated, error?,
  odooServerVersion? }` — never the secret values, and nothing is `console.log`'d.
  - **Design decision, found by testing, not assumed upfront**: there is no single Odoo "ping"
    endpoint guaranteed to exist/behave the same way across instances — a plain `GET
    /web/webclient/version_info` (the first attempt) returned `415` against this real instance.
    The function was rewritten to use the JSON-RPC `common.login` call itself as the one request
    that's guaranteed meaningful on any real Odoo instance: getting back *any* parsed JSON-RPC
    response (even `result: false`, an auth failure) proves reachability; a positive integer
    `result` (the uid) proves the credentials work. This collapses "is it reachable" and "does it
    authenticate" into one request, which is also simpler than the original two-request design.
  - A secondary, unauthenticated `common.version()` call is made **only when reachable but not
    authenticated** — Odoo's `common.login` returns a bare `false` on bad credentials (no reason
    given, by design, for security), so `common.version()` (needs no credentials) is used purely
    to confirm the base URL is answering as a genuine Odoo server, which narrows the diagnosis.
  - `Deno.serve` with a small inline CORS header set (not yet extracted to a shared module — this
    function was kept deliberately minimal per "smallest possible", per the instruction not to
    build the rest of the architecture until this succeeds; a `supabase/functions/_shared/`
    module for CORS/JSON-RPC helpers is the natural next step once more functions exist).
- **Server-side Node Odoo client review** (`server/odoo/client.ts`, `types.ts`,
  `customFieldMap.ts`, `internalAccessGuard.ts` — read in full, not modified): the JSON-RPC
  `fetch`-based logic in `client.ts` is directly portable to Deno as-is (no Node-specific APIs);
  the only non-portable pieces are `process.env` (→ `Deno.env.get`), the module-level
  `cachedUid` warm-instance cache (Deno Deploy/Supabase Edge Functions have a different isolate
  lifecycle — worth re-examining rather than assuming it caches the same way), and
  `internalAccessGuard.ts`'s `process.env.VERCEL_ENV` production-detection check (meaningless
  outside Vercel). None of this was ported yet — noted here for whoever builds the next functions.

## Interfaces / data

- `GET/POST https://zafjmlwbolgdattfdgch.supabase.co/functions/v1/odoo-health` (requires the
  project's publishable/anon key as a Bearer token, like any Supabase Edge Function) → 
  `{ configured: boolean; reachable: boolean; authenticated: boolean; error?: string;
  odooServerVersion?: string }`.

## Dependencies

- Supabase project `delite-auto` (ref `zafjmlwbolgdattfdgch`), org `sgslitfxrhzlkjhekowa` — already
  provisioned by the user, not created by this pass.
- Supabase secrets `ODOO_BASE_URL`/`ODOO_DATABASE`/`ODOO_USERNAME`/`ODOO_API_KEY` — already set on
  that project by the user, not set by this pass. **Blocking**: the current values don't
  authenticate together — see Known issues.
- Supabase CLI, via `npx supabase` — no new local dependency added (not installed into
  `package.json`; invoked via `npx` same as the ad hoc verification pattern used for Playwright
  browsers in earlier docs).

## Testing / verification

- `npx supabase projects list` — confirmed CLI auth already present, found the `delite-auto`
  project (`ACTIVE_HEALTHY`).
- `npx supabase link --project-ref zafjmlwbolgdattfdgch` — succeeded.
- `npx supabase secrets list --project-ref zafjmlwbolgdattfdgch` — confirmed all 4 `ODOO_*` secret
  *names* exist (values are returned as hashes by Supabase itself, never plaintext; not recorded
  here).
- `npx supabase functions deploy odoo-health --project-ref zafjmlwbolgdattfdgch` — deployed
  successfully (twice, after the endpoint-shape fix described above).
- Invoked directly over HTTPS with `curl` + the project's publishable key (the CLI in this
  environment, v2.117.0, has no `functions invoke` subcommand — confirmed via `--help`, so `curl`
  was used instead):
  - First version: `{"configured":true,"reachable":false,"authenticated":false,"error":"unreachable (status 415)"}`
  - After the fix: `{"configured":true,"reachable":true,"authenticated":false,"error":"authentication_failed (no uid returned)","odooServerVersion":"19.0+e"}`
- **Net result**: `configured: true` and `reachable: true` are both newly, genuinely confirmed —
  across two prior sessions building the Vercel-based integration, no reachable Odoo instance was
  ever available to test against at all (see `odoo-live-catalog-integration.md`'s "Known gaps").
  This is the first real signal that `ODOO_BASE_URL` points at a genuine, live Odoo 19.0
  Enterprise instance. `authenticated: false` is the one remaining blocker.

## `odoo-schema` — live schema introspection (2026-09-16)

Read-only, protected live introspection of the real Odoo schema — the actual data source behind
`Documentations MD/odoo-schema-report.md`'s VERIFIED rows. Explicitly scoped to introspection
only, per the request: no catalog rewrite, no admin work, no frontend changes.

- **`supabase/functions/_shared/odoo.ts`** (new) — a Deno-native port of `server/odoo/client.ts`'s
  shape (`odooExecuteKw`/`odooFieldsGet`/`odooSearchRead`/`odooSearchCount`), reading
  `Deno.env.get` instead of `process.env`. Not a literal shared import of the Node file (Deno has
  no `process.env`) — a deliberate, minimal re-port instead, matching the same pattern
  `odoo-health` already established. `odoo-health` itself was **not** refactored to use this
  module — it was already deployed and verified working, and touching it for a pure refactor
  carried more risk than benefit.
- **`supabase/functions/odoo-schema/index.ts`** (new) — protected by a required
  `x-internal-token` header matching the `INTERNAL_DIAGNOSTICS_TOKEN` Supabase secret (set
  directly — it's an internally-generated access token, not an external credential, so no need to
  ask the user for it, same reasoning as the local `.env.local` value). Fails closed (403) if the
  secret isn't set at all, same "never fail open" principle as `internalAccessGuard.ts`.
  Introspects 17 models via `fields_get` + a small `search_read` sample each: the 8 originally
  scaffolded (`product.template`, `product.product`, `product.category`,
  `product.public.category`, `product.attribute`, `product.attribute.value`,
  `product.template.attribute.line`, `product.template.attribute.value`) plus `product.image`,
  `product.pricelist`, `product.pricelist.item`, `product.tag`, `product.template.tag`,
  `res.partner`, `sale.order`, `sale.order.line`, `stock.quant`. Read-only throughout — only
  `fields_get`/`search_read`/`search_count`, never `create`/`write`/`unlink`.
  - `product.template`/`product.product` get special handling: every field on them starting with
    `x_`/`x_studio_` is captured dynamically (that's the actual point of custom-field discovery —
    there's no fixed list to check against). Every other model uses a curated "fields of
    interest" allowlist instead of dumping every field Odoo has (`res.partner`/`sale.order` alone
    have 100+ fields each).
  - Image fields (`image_1920` etc.) are **never requested as values** in any `search_read` — only
    checked for existence via `fields_get`, per the explicit instruction not to dump base64
    payloads.
  - `res.partner`, `sale.order`, `sale.order.line` are introspected for field metadata only and
    **never sampled** — no customer/order records are ever fetched, per instruction.
- **Two real bugs found and fixed while building this, both through evidence, not guesswork**:
  1. **Rate limiting.** The first version fired all 17 models' `fields_get`+`search_read` calls
     via `Promise.all` (~30 concurrent requests) — Odoo responded with `HTTP 429` on most of them,
     and even silently starved `product.template`'s own sample (no thrown error, just an empty
     result, since its two `fields_get` calls raced the other 15 models' calls too). Fixed by
     making every call sequential with a 350ms delay between them — this is a one-off diagnostic
     endpoint, not a hot path, so there's no reason to race the instance's rate limiter for speed.
  2. **`product.template`'s sample stayed empty even after the rate-limit fix**, with no error —
     traced by adding a diagnostic fallback (a minimal 2-field query + `search_count`) rather than
     guessing, which surfaced the real cause: `builtins.ValueError: Invalid field 'free_qty' on
     'product.template'` — `free_qty` exists on `product.product` but not `product.template` on
     this instance, and the template sample's field list was built from the raw candidate list
     instead of the already-`fields_get`-filtered one (unlike every other model's sample, which
     correctly filtered first). Fixed by building `templateSampleFields`/`variantSampleFields` from
     the confirmed-present field lists instead of the raw candidates.
- **Deploys also hit transient `409 "Function was deployed concurrently by another request"`
  errors a few times** — consistent with another session/window also working against this same
  Supabase project concurrently. Resolved by retrying; no data was lost or overwritten (Edge
  Function deploys are atomic per-version, not merged).
- **Sample sizes**: most models sample 3 records (default); `product.template` samples 20,
  `product.product` 15, `stock.quant` 5, and after the first pass revealed genuinely useful
  structure worth seeing in full, `product.public.category`/`product.category`/
  `product.attribute.value` were bumped to 40 and `product.template.attribute.line`/`.value` to
  25 — large enough to see real structure (e.g. the full flat category list, real attribute-value
  assignments) without being unbounded.

## Local development (`.env.local`)

- **`.env.local`** (new, gitignored — already covered by the existing `.gitignore` patterns
  `.env` / `.env.*`, verified with `git check-ignore -v .env.local` and confirmed absent from
  `git status`, no `.gitignore` changes were actually needed). Structure: `ODOO_BASE_URL`/
  `ODOO_DATABASE`/`ODOO_USERNAME`/`ODOO_API_KEY` left **blank** for the user to fill in directly
  from Odoo (not copied from Supabase — the whole point is to test whether the Supabase-stored
  values were the ones entered incorrectly); `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
  pre-filled (both genuinely public/safe for the browser by design — confirmed via
  `npx supabase projects api-keys`, this is the `sb_publishable_...` key, not the anon JWT,
  service_role, or secret key, none of which were put in any file); `VITE_CATALOG_SOURCE=http`;
  `INTERNAL_DIAGNOSTICS_TOKEN` pre-filled with a freshly generated random value (safe to generate
  directly — unlike the Odoo credentials, this token doesn't come from an external system, it's
  created for this purpose).
- **No `VITE_ODOO_*` variables exist anywhere** — the Odoo credentials only ever need to be read
  server-side (`server/odoo/client.ts` via `process.env`, or a future Edge Function via
  `Deno.env.get`), never by React.
- **Local test script**: `npm run odoo:health:local` — runs
  `node --env-file=.env.local node_modules/vite-node/vite-node.mjs scripts/odoo-health-local.ts`.
  `scripts/odoo-health-local.ts` (new) imports and calls the *existing*
  `verifyOdooConnection()` from `server/odoo/verifyConnection.ts` directly — the same function
  `api/internal/odoo/health.ts` and the opt-in integration test already use — so this pass added
  zero new Odoo-checking logic, just a way to run the existing check locally against `.env.local`
  instead of a deployed environment.
  - **Why `vite-node`, not plain `node --env-file`**: tried plain `node --env-file=.env.local
    scripts/...ts` first — failed with `ERR_MODULE_NOT_FOUND`, because Node's native ESM resolver
    requires explicit file extensions on relative imports, while `server/odoo/*.ts` uses
    extensionless imports (`from "./client"`), which is correct for this project's
    `moduleResolution: "bundler"` (matches how `tsc`/Vite/Vitest already resolve these files).
    Rather than edit `server/odoo/verifyConnection.ts` to add extensions (which would ripple into
    the other in-progress Odoo work and might not even be TS-valid without also enabling
    `allowImportingTsExtensions`), the script is run through `vite-node` instead — already present
    via the existing `vite`/`vitest` dependency, zero new packages installed — which resolves
    these imports the same way the rest of the project's tooling does. Node's own `--env-file`
    flag is kept as the *outer* process so `.env.local` loads into `process.env` before `vite-node`
    (running in that same process, not a spawned child) even starts — confirmed this actually
    reaches the target script with a throwaway probe before relying on it.
  - Exits non-zero and reports which stage failed (`configured`/`reachable`/`authenticated`/
    `canReadCatalog`) without ever printing a credential value — `verifyOdooConnection()` already
    guaranteed this (see its own doc comment in `verifyConnection.ts`), the script just surfaces
    it as a CLI-friendly pass/fail.
  - **Dry-run verified** (with the Odoo fields still blank): reports
    `{"configured":false,...}` and exits 1 with a clear message — confirming the whole pipeline
    (env loading → module resolution → the check itself) works before any real credentials are
    involved.
- **Local Supabase Edge Function serving — not usable in this environment**: `supabase functions
  serve --env-file <path>` accepts an arbitrary env file path directly (confirmed via
  `--help` — "Overrides supabase/functions/.env and per-Function .env files"), so
  `npx supabase functions serve --env-file .env.local` would point the *same* `.env.local`
  straight at local Edge Function development with **no duplicate/generated env file needed** —
  satisfying "only if the CLI requires a separate file," which it doesn't. However, `supabase
  functions serve` requires Docker (it runs a local Edge Runtime container), and **Docker isn't
  installed in this environment** (`docker --version` → command not found). This is why
  `npm run odoo:health:local` (plain Node/vite-node, no Docker) exists as the practical local-test
  path here; the `supabase functions serve --env-file .env.local` command above is documented for
  whenever Docker is available (a different machine, or installing Docker Desktop here).

## Resolved: authentication root cause (2026-09-15 → 09-16, iterative)

The original `authenticated: false` (both `configured: true`, `reachable: true`, genuine
`odooServerVersion: "19.0+e"`) took several rounds to resolve, each narrowing the cause with a
new, safely-surfaced (non-secret) signal rather than guessing:

1. **`ODOO_DATABASE` was a literal placeholder** (`"your-db-name"`) — not entered by the user
   incorrectly so much as never actually replaced. Surfaced by adding Odoo's own
   `error.data.name`/`error.data.message` to the health response (a `psycopg2.OperationalError:
   database "your-db-name" does not exist` — Odoo's own diagnostic text, never a credential
   value) — previously `common.login` only returned a bare `false` with zero detail. Fixed via
   `supabase secrets set ODOO_DATABASE=<real name>`.
2. With the database fixed, `common.login` still failed, this time with Odoo's normal
   "invalid credentials, no further reason given" behavior (by design, for security) — no way to
   tell from that alone whether `ODOO_USERNAME` or `ODOO_API_KEY` (or both) was wrong.
3. **Added a second, independent authentication diagnostic**: Odoo 19's native JSON-2 API
   (`POST {baseUrl}/json/2/res.partner/search_count`, `Authorization: Bearer <ODOO_API_KEY>`,
   optionally `X-Odoo-Database`) alongside (not replacing) the legacy `common.login` check —
   `legacyRpcAuthenticated` and `json2Authenticated` are now reported separately. This mattered
   because Odoo API keys are documented as not usable for the classic web login, and the two auth
   paths can genuinely diverge — an independent second signal was needed rather than continuing
   to guess at the single legacy result. First JSON-2 attempt (with the then-current key) returned
   a clean `401 "Invalid apikey"` — Odoo's own error text, confirming the key itself (not
   database/username routing) was the remaining problem, and ruling out `X-Odoo-Database` routing
   as a factor (tried both with and without it; identical failure either way).
4. User regenerated/re-verified `ODOO_USERNAME` and `ODOO_API_KEY` directly in Odoo and set both
   via `supabase secrets set`. Final result: `legacyRpcAuthenticated: true`,
   `json2Authenticated: true`, `json2HttpStatus: 200`, `json2DatabaseHeaderRequired: false`.

**Current `odoo-health` response fields**: `configured`, `reachable`, `legacyRpcAuthenticated`,
`error?`, `odooServerVersion?`, `json2Authenticated?`, `json2HttpStatus?`, `json2Error?`,
`json2DatabaseHeaderRequired?`. Still never returns secret values; Odoo's own error text (never
containing credential values) is surfaced when authentication fails, to make future diagnosis
possible without repeating this multi-round process blind.

## Operational note: API key rotation (2026-09-17)

Odoo API keys are not permanent — they can expire, be rotated, or be revoked directly in Odoo,
independently of anything in this repo or in Supabase. This has already happened twice in real
production use of this integration (see the "Resolved: authentication root cause" section above
for the first occurrence during initial setup; a second, separate failure and recovery happened
during the 2026-09-17 stabilization pass, confirmed via `odoo-health` going from
`legacyRpcAuthenticated: true` to `false` with no code or deployment change in between — purely an
external credential-state change on Odoo's side).

**What happens when the key goes bad:**
- `odoo-health` reports `legacyRpcAuthenticated: false`, `json2Authenticated: false`,
  `json2Error: "Invalid apikey"` (Odoo's own error text, never a credential value).
- `catalog-products`/`catalog-product-detail` correctly return `502 { error: "Catalog temporarily
  unavailable" }` — confirmed, by design, per "Failure behavior" in `odoo-real-catalog.md`: a
  configured-but-failing Odoo call is a real error state, **never** a silent fallback to mock/local
  data. This was directly observed working correctly during both real failures, not just a
  theoretical guarantee.

**How to recover (no redeploy needed):**
1. Regenerate/verify `ODOO_API_KEY` (and, if relevant, `ODOO_USERNAME`) directly in Odoo.
2. `supabase secrets set ODOO_API_KEY=<new value> --project-ref zafjmlwbolgdattfdgch` (never paste
   the key value into this session/chat — same rule as initial setup).
3. **Do not redeploy any Edge Function.** Supabase secrets are read at request time via
   `Deno.env.get(...)` — they are runtime environment variables, not baked into a deployed bundle.
   A secret update takes effect on the *next* invocation of any function, immediately.
4. Re-run `GET/POST .../functions/v1/odoo-health` and confirm `legacyRpcAuthenticated: true` and
   `json2Authenticated: true` before assuming the catalog has recovered.
5. Spot-check one real catalog call too (e.g. `catalog-products?pageSize=1`) — `odoo-health`
   passing confirms the credential works, not that every downstream function is healthy.

**Frontend impact: none.** `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` (the only two values
the browser/Vercel ever needs) do not change when `ODOO_API_KEY` is rotated — the frontend has no
knowledge of Odoo credentials at all (see "Architecture" in `odoo-real-catalog.md`). No frontend
rebuild or Vercel env var change is needed for an Odoo-side key rotation.

## Known issues / follow-ups

- **Everything past `odoo-health` is intentionally not built yet** — `odoo-schema`,
  `catalog-products`, `catalog-product-detail`, `catalog-categories`, `catalog-media`, and the
  `supabase/functions/_shared/` module they'd share are all deferred until authentication
  succeeds, per explicit instruction.
- **The existing Vercel-based integration (`api/catalog/*`, `server/odoo/*`) is untouched** and
  still what `catalogService` would use if `VITE_CATALOG_SOURCE` were ever flipped to `http` — it
  has the same "never verified against a live instance" status as before this pass, since this
  pass tested connectivity via the new Edge Function, not the old Vercel routes (which have no
  live credentials to run against locally anyway). Once Edge Function auth succeeds, a decision is
  needed on whether to retire the Vercel routes or keep both.
- No `supabase/config.toml` was generated — this CLI version's `link`+`deploy` worked without one
  for a single ad hoc function; revisit if `supabase functions serve` (local dev) or migrations
  are needed later.
- **`odoo-schema` testing**: no Deno CLI is available in this environment to type-check the Edge
  Function code locally before deploy (checked — `deno --version` → command not found); the
  deploy step itself is the validation (it bundles/parses the TypeScript and rejects real syntax
  errors — this genuinely caught one: a JSDoc comment containing the literal substring `*/`
  mid-sentence prematurely closed the comment block and broke the parser). `npm run lint`,
  `npm run build`, `npm run typecheck:server`, and `npm run test:unit` (34 passed, 1 skipped) all
  stayed clean throughout — none of the new Deno files are covered by those Node-side tools
  (`tsconfig.server.json` only includes `server/**`/`api/**`), so this is confirming "didn't break
  anything else," not validating the Deno code itself.
- **No new custom-field mapping was configured** (`ODOO_BRAND_FIELD` etc.) — there's nothing to
  point them at; see `odoo-schema-report.md`'s finding that no custom fields exist on this
  instance at all. Any future catalog work needs a different mapping strategy (the "Model"
  attribute for fitment, `product.public.category` for brand/vehicle) than what
  `customFieldMap.ts` currently supports.

## Revision log

| Date       | Author | Change                                  |
|------------|--------|------------------------------------------|
| 2026-09-15 | Claude | Initial version — linked repo to the `delite-auto` Supabase project, built/deployed/verified `odoo-health` Edge Function. Reachable and running genuine Odoo 19.0 Enterprise confirmed; authentication blocked on credential mismatch, reported to user rather than guessed at |
| 2026-09-15 | Claude | Added `.env.local` (gitignored, Odoo fields left blank for user to fill in from Odoo directly) + `npm run odoo:health:local` (reuses existing `verifyOdooConnection()`, run via `vite-node` since plain Node's ESM resolver doesn't handle this project's extensionless imports) so credentials can be tested locally before deciding whether to update the Supabase-stored secrets |
| 2026-09-16 | Claude | Surfaced Odoo's own (non-secret) error detail in `odoo-health`, which found `ODOO_DATABASE` was a literal unreplaced placeholder. Added a second, independent authentication diagnostic (Odoo 19 JSON-2 API, Bearer-token auth) alongside the legacy `common.login` check — found the API key itself was invalid (`401 "Invalid apikey"`) once the database was fixed, ruling out database-routing as a factor. After the user regenerated/re-set `ODOO_USERNAME`/`ODOO_API_KEY`, both `legacyRpcAuthenticated` and `json2Authenticated` now report `true` — first confirmed live Odoo authentication in this repo's history. Stopped before any catalog/schema/admin work, as instructed. |
| 2026-09-16 | Claude | Added `supabase/functions/odoo-schema/` (+ shared `_shared/odoo.ts` Deno client) — protected, read-only live introspection of 17 Odoo models. Found and fixed two real bugs while building it: Odoo rate-limiting from firing all requests in parallel (fixed to sequential), and `product.template`'s sample silently failing due to requesting an unconfirmed field (`free_qty`, only valid on `product.product`). Fully rewrote `odoo-schema-report.md` with real VERIFIED findings from the live instance — no custom fields exist at all; brand/vehicle/fitment are all modeled through a flat, mixed-purpose `product.public.category` and a free-text "Model" attribute, not dedicated fields. Stopped before catalog/admin work, as instructed. |
| 2026-09-17 | Claude | Stabilization pass: authentication failed a second time in real production use (`ODOO_API_KEY` invalidated externally, unrelated to any code/deploy change), then recovered after the user rotated the key in Odoo and reset the Supabase secret — confirmed via `odoo-health` and a full live catalog re-verification (345 products, 37 categories, non-catalog exclusion, vehicle/brand/fitment filters, multi-variant + gallery product, all matching prior verified numbers). Added this "Operational note: API key rotation" section documenting the recovery procedure (no redeploy needed — Supabase secrets are runtime env vars; frontend needs no changes since it never holds Odoo credentials). |
