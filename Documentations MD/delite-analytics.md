# Delite First-Party Analytics

## Metadata

| Field | Value |
|---|---|
| Feature name | First-party ecommerce analytics (collection + aggregation + Admin reporting) |
| File | `Documentations MD/delite-analytics.md` |
| Branch | figma |
| Owner | Claude (v2 build on top of a Codex foundation) |
| Status | Done (see "Known issues / follow-ups" for the honest gaps) |
| Created | 2026-09-18 |
| Last updated | 2026-09-21 |

## Summary

The storefront records first-party page views, engaged time, scroll depth, product/search/cart/
checkout/recommendation/promotion events and (server-side only) purchases through one validated
Edge Function into private Postgres tables. Ten Admin pages under **Admin → Analytics** answer the
owner's questions (traffic, pages, products, carts, conversion, search, recommendations, geography,
acquisition, customer/session journeys) from **database-side aggregate functions**, with
period-over-period comparison, deterministic insights and clear metric definitions. No fingerprinting,
no third-party trackers, no raw IP stored.

## Why

The previous state had no analytics backend at all (`recommendations/analytics.ts` only did
`console.debug`). The owner needs to know who visits, what they look at, what they put in carts and
abandon, where they come from and what converts — without adding invasive tracking or a
third-party SDK. Odoo stays the source of truth for products/orders; analytics only *observes*.

## Scope

Included: collector, schema, ingest + purchase functions, ~25 reporting RPCs, storefront
instrumentation, Admin UI (10 pages + 5 drawers), tests, this doc.

**Explicitly not built (per the brief):** recovery emails/WhatsApp, ad pixels (Meta/Google Ads),
CRM automation, AI customer profiling, cross-site tracking, fingerprinting. A supersession note:
the earlier thin foundation (`20260918120000_create_analytics.sql`, `Analytics.tsx`, `Carts.tsx`) was
verified **empty/never deployed** and is replaced (the old migration file is untouched history; the
new migration refuses to drop non-empty tables).

## Architecture

```
React storefront
  RouteTracker ─ engagement timer/scroll ─┐
  CartContext (single cart seam) ─────────┤   AnalyticsQueue (batch: ≤10 events / 5 s /
  Header, Shop, PDP, Checkout, rails ─────┤   immediate for cart+checkout / pagehide flush)
  recommendations/analytics.ts (seam) ────┘            │  fetch, or sendBeacon on unload
                                                       ▼
                        Supabase Edge Function  analytics-track  (verify_jwt = false)
                        validate (strict schemas) → bot/test filter → verify user token
                        → classify source → geo lookup (background) → RPC
                                                       ▼
        public.analytics_ingest_batch()  (service role only; one atomic transaction)
           sessions · page_views · events · carts · cart_items · order_items
                                                       ▼
        public.admin_analytics_*()  (SECURITY DEFINER, role check FIRST, aggregate in SQL)
                                                       ▼
                      Admin → Analytics (React, lazy-loaded, recharts)
```

`create-order` (Edge Function) records the **purchase** server-side after Odoo and the orders mirror
succeed, via `analytics_record_purchase()` — a browser cannot create one.

## Identity

- **Visitor ID** — random UUID in `localStorage` (`delite-analytics-visitor`). Approximates a returning
  anonymous browser. Never derived from hardware. No canvas/audio/font/WebGL fingerprinting exists anywhere.
- **Session ID** — random UUID in `sessionStorage`, rotated after **30 minutes of inactivity** (and on
  logout / account switch so the next person never shares a session). Attribution (landing path, referrer,
  UTM) is captured once when the session is created and never overwritten.
- **Cart ID** — random UUID in `localStorage`, rotated after a successful order.
- **User ID** — *never* asserted by the browser. The client only forwards its Supabase access token; the
  Edge Function verifies it (`auth.getUser`) and the DB stores that verified id. A forged/expired token
  degrades to anonymous. A body/event `user_id` field is rejected by the schema.
- **Login mid-session** — the current anonymous session and the current cart are attached to the verified
  user; earlier history is kept (no destructive merge). A different visitor can never write into another
  visitor's session or cart (ownership checks in SQL — tested).

## Event taxonomy (strict allowlist; server-validated per-event schemas)

`product_view · search_submitted · search_result_click · search_zero_results · category_view ·
brand_view · add_to_cart · remove_from_cart · cart_quantity_changed · cart_viewed · wishlist_add ·
wishlist_remove · checkout_started · checkout_step_viewed · checkout_completed · checkout_failed ·
purchase (server-owned) · recommendation_impression/click/add_to_cart · navigation_click ·
promotion_impression/click · contact_started · contact_submitted`.

Page views are a first-class table (`analytics_page_views`) rather than `analytics_events` rows: one row
per SPA route view, updated in place with cumulative engaged seconds and max scroll — no per-second
events. Unknown event names, unknown fields, oversized metadata, bad ids, `purchase`, and out-of-range
numbers are rejected (`_shared/analytics/core.ts`, 23 unit tests). The Edge Function validates
*leniently at event level*: one bad event is skipped and reported, it never discards the batch; structural
errors and `purchase` attempts are hard 400s.

Surfaces used: `nav_cars/bikes/brands/deals/our_store/contact/search/cart`, `home_hero`,
`home_vehicle_split`, `home_category_strip`, `home_promo`, `home_trending`, `home_featured`,
`home_new_arrivals`, `product_detail`, `cart_drawer`, `contact_form`, `home_get_in_touch`.

## Time on page / engaged time

Not `next_pageview − this_pageview`. `EngagementTimer` accrues only while the tab is **visible and the
visitor is not idle** (no pointer/key/scroll/touch for 60 s pauses it). Flushed on route change, tab
hide (`visibilitychange`) and `pagehide` (via `navigator.sendBeacon`, no CORS preflight), plus a 30 s
cumulative heartbeat. Values are cumulative and idempotent (server keeps the max, clamped to
wall-clock-plausible and ≤ 4 h per page view). Scroll depth stores the maximum percent per page view.
Tested with mocked clocks (visible 10 s ≈ 10 s, hidden tab doesn't accrue, overnight-visible tab stops
at idle, route-change flush semantics).

## Location

Verified in this deployment (probe Edge Function, deleted after): **no** geo headers are provided —
only the visitor IP (`cf-connecting-ip`; `cf-ray`'s colo code is the Cloudflare data-centre, not the
visitor, and is not used). So geography is a **server-side IP lookup, once per new session**, in a
background task: the IP exists only in memory for that call and is never stored, logged or sent to
React. Only country / region / city are persisted; no coordinates are requested (`?fields=`). Provider:
`ipwho.is` over HTTPS (keyless), configurable via `ANALYTICS_GEO_URL`; disable entirely with
`ANALYTICS_GEO_ENABLED=false`. **Business/legal decision required:** this sends visitor IPs to a third
party. Verified live (Mumbai / Maharashtra / IN). Private/loopback IPs are skipped; failures leave
location "Unknown". No GPS permission prompt.

## Traffic source attribution

First landing only (`_shared/analytics/core.ts#classifySource`, 10 unit tests): Direct, Google Organic,
Search (Bing/DDG/…), Instagram, Facebook, WhatsApp, Referral, Campaign (UTM campaign / paid / email
medium), Other. Same-site referrers count as Direct. UTM values are allow-listed characters; referrer
stored as `host/path` only (never a query string).

## Devices

Coarse only: device (mobile/tablet/desktop), browser family, OS family, parsed at the edge; the raw
User-Agent is discarded.

## Carts, abandonment, recovery

`analytics_carts` / `analytics_cart_items` are an **observation record, not the commerce cart**. Lines
are keyed by Odoo template/variant id with **`observed_unit_price` / `observed_line_value`** —
deliberately historical measurements (an exception to "CMS stores ids only"), never used to render
current prices. Removed lines are soft-removed (`removed_at`). `CartContext` is the single seam:
add/remove/quantity events are emitted outside React state updaters (StrictMode-safe); initial hydration
from localStorage is **not** cart activity.

**Official abandonment rule (one definition, in SQL — `private.analytics_cart_status`):**
> a cart is **abandoned** when it has ≥ 1 item, was never converted to an order, and has had **no
> activity for ≥ 30 minutes**.

Derived from timestamps at read time — no cron. Aging buckets: 30 min–6 h, 6–24 h, 1–3 d, 3 d+.
**Recovered** = a cart that had gone quiet ≥ 30 min and was later touched again or converted
(`abandoned_at`/`returned_at` are stamped once, on that return). Tested: anonymous, authenticated,
still-active, converted-before-threshold, abandoned-then-converted, abandoned-returned-not-bought,
empty cart, purchase idempotency, foreign-cart protection (`supabase/tests/analytics_abandonment.sql`).

## Purchases / conversion

`purchase` is recorded only by `create-order` **after** Odoo accepted the order and the `orders`
mirror row exists, from server-verified data (Odoo's `amount_total`, real line prices and template ids).
It is idempotent per order (unique index), links cart/session/visitor/user/order/Odoo sale-order id,
writes `analytics_order_items`, and marks the cart converted. Analytics failure can never fail a
successful order (own try/catch). Revenue = purchase totals only; abandoned value is never revenue.
Co-purchase ("frequently purchased together") uses `analytics_order_items`; co-carting is separate.

## Recommendation tracking

`trackRecommendationEvent()` (the existing seam, call sites unchanged) now forwards to the collector.
`ProductCarousel` gained an optional `tracking` prop: one impression per product when the rail is ≥ 40 %
visible, plus clicks and adds from its cards (PDP "You might also like", homepage Trending / Featured /
New Arrivals). Cart-drawer cross-sell continues to use the same seam. Metrics: impressions, clicks, CTR,
adds, add rate — by surface, strategy and product.

## Metric definitions (also shown as tooltips in the UI)

| Metric | Definition |
|---|---|
| Page views | Every recorded route view (not "unique views") |
| Unique visitors | Distinct visitor id in the period |
| Logged-in users | Distinct verified user id |
| Sessions | Distinct sessions **started** in the period |
| Engaged time | Active, visible, non-idle seconds; average **and median** per session/visitor/page |
| Low-engagement ("bounce") session | Exactly 1 page view, < 10 s engaged, and no tracked interaction |
| Landing / exit page | First / last page view of the session (an exit after a purchase is expected) |
| Conversion rate | Sessions with a purchase ÷ sessions |
| Funnel | Distinct **sessions** (or visitors) at each step — event counts are never mixed in |
| Abandonment rate | abandoned ÷ (abandoned + converted) among carts last touched in the period |
| Add rate (product) | Sessions that added ÷ sessions that viewed |
| New vs returning | Visitor id seen in an earlier session or not (id only; no fingerprinting) |

**Period semantics ("cohort by session start"):** a period contains the sessions that started in it, and
all page views/events/orders of those sessions. Cart metrics use the cart's last activity. Timezone:
buckets/labels use `Asia/Kolkata`; storage stays `timestamptz`. Presets ("Today", "Last 7 days", …)
resolve at IST midnight (tested around the UTC/IST date boundary). Comparison = equal-length previous
period or same dates last year; a zero baseline shows **"New"**, never Infinity%.

## Insights (deterministic, documented thresholds)

`admin_analytics_insights` emits an insight only when its minimum sample size is met:
product with ≥ 50 view-sessions and ≤ 2 % adds · mobile purchase rate < 60 % of desktop (≥ 100 sessions
each) · a query searched ≥ 5 times that always returned nothing · ≥ 3 abandoned carts (their value) ·
a channel with ≥ 30 sessions and ≥ +25 % vs the previous period (previous ≥ 10). Sentences are built in
the UI from `code + params` (product names resolved live from Odoo). Nothing is model-generated.

## Bots / internal / test traffic

- Obvious bots, crawlers, monitors and headless automation are dropped at the edge (`202 ignored`).
- **localhost, dev builds, Playwright/Vitest and any `navigator.webdriver` browser send nothing**
  (`config.ts`). A developer/test can opt in with `localStorage["delite-analytics-debug"]="1"`; those
  sessions are stored `is_test = true`, and *any* request whose Origin is localhost is forced to
  `is_test`. Reports exclude test traffic unless "Include test data" is on.
- Sessions of signed-in staff (any admin role) and visitors marked internal (Admin → session drawer,
  owner/admin) are `is_internal`, excluded by default ("Include internal" toggle).
- Best-effort per-visitor rate limit (240 events/min) in the Edge Function; DB dedupe by event id is
  the real safety net.

## Privacy

First-party, first-party-storage identifiers only. Stored per event: ids, coarse fields, allow-listed
metadata. **Never** stored: passwords, payment data, addresses, contact-form message bodies (only
`contact_started`/`contact_submitted`), free-form sensitive fields, query strings/fragments (paths are
allow-listed; order ids collapse to `/order/:id`; unknown routes → `/other`), raw User-Agent, raw IP.
Search text that looks like an e-mail or card number is not recorded. `user_id` alone links activity to a
customer; name/e-mail/phone are read on demand from `profiles`/`auth.users` by a protected RPC and shown
in full only to owner/admin/support (analytics-only role sees a masked e-mail, no name/phone).
**Consent readiness:** `analyticsAllowed()`/`setAnalyticsOptOut()` in `config.ts` is the single gate; a
future cookie banner calls it with no other change. There is currently no consent banner in the app and
this doc does not assert any legal requirement — that is a business/legal call (see follow-ups).

## Security / RLS

All seven `analytics_*` tables: RLS on, **no** client insert/update/delete grants, `anon` has no grants,
direct `SELECT` only for owner/admin/analytics. Ingestion functions are executable **only by
`service_role`**. Every `admin_analytics_*` function is `SECURITY DEFINER`, `search_path=''`, no `anon`
grant, and calls `private.analytics_require(roles)` as its first statement (authorization is in the
database, not the browser):

| Capability | Roles |
|---|---|
| Aggregates (overview, traffic, pages, products, funnel, search, geo, sources, insights) | owner, admin, analytics |
| Cart lists/detail, session journey, recent activity, health | owner, admin, analytics, support |
| Customer journey (person level) | owner, admin, support |
| Full customer name/e-mail/phone | owner, admin, support (others: masked) |
| Mark internal visitor / purge test data | owner, admin |
| Retention purge | owner |

`content` and `merchandising` roles and non-admin users have no access. Verified by
`supabase/tests/analytics_rbac.sql` (all 6 roles + non-admin + no-JWT, PII masking) and a Playwright test
that anonymous REST calls to the RPCs are refused.

## Indexes & aggregation

Reports never load raw events into React; each is one SQL function returning JSON. Indexes map to
queries: `events(occurred_at)`, `(event_name, occurred_at)`, `(session_id, occurred_at)`,
`(odoo_template_id, occurred_at)` partial, `(user_id, occurred_at)` partial, `(cart_id, occurred_at)`
partial, `(search_query_norm, occurred_at)` partial, unique purchase-per-order; `sessions(started_at)`,
`(last_activity_at)`, `(visitor_id, started_at)`, `(user_id, started_at)` partial, `(country_code,
started_at)` partial; `page_views(started_at)`, `(session_id, started_at)`, `(path, started_at)`,
`(odoo_template_id, started_at)` partial; `carts(last_activity_at)`, `(user_id)` partial,
`(converted_at)` partial; `cart_items(odoo_template_id)`, `order_items(odoo_template_id, occurred_at)`.
**Measured** (`supabase/tests/analytics_scale.sql`, rolled back): ~25k sessions / ~103k page views / ~52k
events → overview 0.85 s, time series 0.53 s, funnel 0.40 s, pages 0.66 s, products 0.31 s, geography
0.54 s, sources 0.34 s, landing/exit 0.67 s.

**Partitioning:** not needed yet. Consider monthly range partitioning of `analytics_events` /
`analytics_page_views` past roughly 20–50 M rows, or when 12-month scans stop meeting ~1 s; and
daily rollup tables for the Overview once the period scans dominate.

## Retention

Suggested starting point: raw events/page views 12–18 months, aggregates longer. **Nothing is deleted
automatically** (needs a business decision). Available, explicit tools: `admin_analytics_purge_before(ts)`
(owner only; refuses anything newer than 30 days; cascades sessions → page views/events) and
`admin_analytics_purge_test_data()` (owner/admin). A user deleting their account sets their `user_id` to
NULL on analytics rows (FKs are `on delete set null`) rather than blocking the deletion.

## Admin routes

`/admin/analytics` (Overview) · `/traffic` · `/pages` (Pages / Landing / Exit) · `/products` (+ drawer) ·
`/carts` (dashboard, abandoned/recovered list, cart drawer, carted- vs purchased-together) · `/conversion` ·
`/search` (+ query drawer) · `/recommendations` · `/geography` (country → state → city drill-down) ·
`/acquisition` (channel / source-medium / campaign / referrer). Old `/admin/carts`, `/admin/visitors`,
`/admin/analytics/store` redirect. Filters (date preset/custom, compare, audience, device, country,
source, include internal/test) live in the URL. The pages and recharts load lazily (separate chunk).
Charts: one axis, thin lines, legend + table view, tooltips; series colours are the first three slots of a
validated colour-vision-safe palette (aqua's contrast <3:1 is the reason a visible legend and table view
exist). Empty states say "No analytics collected yet" — never fake zeros; "collecting since" is shown.

## Implementation notes (files)

- `supabase/migrations/20260921100000_analytics_v2_schema.sql` — tables, indexes, RLS, cart-status view.
- `…100100_analytics_ingest_functions.sql` — `analytics_ingest_batch`, `analytics_set_session_geo`, `analytics_record_purchase`.
- `…100200_analytics_reporting_core.sql`, `…100300_analytics_reporting_commerce.sql` — reporting RPCs.
- `supabase/functions/_shared/analytics/core.ts` — pure validator/sanitisers/UA/source classifier (shared with Vitest).
- `supabase/functions/analytics-track/index.ts`; `supabase/functions/create-order/index.ts` (purchase hook); `supabase/config.toml` (`verify_jwt=false` for the collector).
- `src/lib/analytics/{client,queue,engagement,pathing,config,RouteTracker,useOnVisible}` — storefront collection.
- Instrumented: `CartContext` (cart events + snapshot), `Header` (nav/search), `Shop` (search + clicks), `Checkout`/`Cart`/`OrderConfirmation` (funnel), `history.ts` (product view), `ProductCarousel`/`ProductCard` (rails), `Hero`/`PromoBannerPair`/`CategoryIconStrip`/`VehicleShopSplit` (promotions/navigation), `ContactForm`/`GetInTouchBox`.
- `src/admin/analytics/*` — API types, URL-synced filters, hooks, components, drawers, ten pages; `adminAuth.ts` nav; `App.tsx` lazy routes.
- Removed (superseded, never deployed): `src/admin/pages/analytics/{Analytics,Carts}.tsx`.
- Dependency added: `recharts` (+ `react-is`), admin-only lazy chunk.

## Testing / verification

- Unit (Vitest, 99 pass): `server/analytics/core.test.ts` (validation, spoofed user_id, oversized metadata, purchase rejection, privacy, UA, source), `src/lib/analytics/analytics.test.ts` (mocked-clock engagement, batching/retry/ordering), `src/admin/analytics/analyticsMath.test.ts` (IST ranges, comparison, "New" not Infinity).
- SQL (run via `npx supabase db query --linked --file …`; all roll back): `analytics_rbac.sql`, `analytics_abandonment.sql`, `analytics_scale.sql`; `analytics_seed.sql` seeds a deterministic `is_test` dataset.
- Playwright: `analytics-tracking.spec.ts` (5, mocked endpoint — journey Home→Shop→PDP→Add→Cart→Login→Checkout, privacy, hidden-tab, admin excluded, failure never breaks shopping) and `admin-analytics.spec.ts` (10: overview, date range, sorting, product drill-down, abandoned-cart detail, search, geography, permission denial, empty state, real-backend denial + smoke).
- Live end-to-end (real collector, `is_test`): attribution, page views/entrance/referrer path/Odoo id, engagement, login association of session **and** cart, staff-internal flag, live search (real result count) and result click with latency, geo (Mumbai/Maharashtra), hostile requests (bad key, purchase, spoofed `user_id`, bot UA, session hijack, oversize, CORS).

## Known issues / follow-ups

- **`create-order` → purchase was reviewed and SQL-tested but not exercised live**: doing so places a real Odoo `sale.order`. The first real order will be the live proof.
- Geo lookup sends IPs to a third party (see Location) — needs owner/legal sign-off; can be switched off.
- No consent banner exists; analytics runs for all production visitors (opt-out flag only). Confirm requirements.
- A search is recorded only after its results load; abandoning before that records nothing (by design: result count must be real).
- `user_id` on a session is the *first* authenticated identity (events keep their own).
- "Recovered" needs the customer to return; no outbound recovery messaging exists (out of scope).
- Historical-only: purchased-together and lifecycle metrics only cover history since tracking began.
- At multi-million-session scale add daily rollup tables (see Indexes).
- Product images/names resolve live; archived products show "no longer in catalog".
- Insights thresholds are conservative defaults — tune with real data.

## Revision log

| Date | Author | Change |
|---|---|---|
| 2026-09-18 | Codex | Initial first-party collection and Admin analytics foundation. |
| 2026-09-18 | Codex | Added cart snapshots, derived abandonment detail, search interactions, server-owned purchases, and validation refinements. |
| 2026-09-18 | Codex | Improved analytics presentation with metric definitions, period comparison, daily trend, funnel, and ranked bars; see homepage-editor-and-admin-appearance.md. |
| 2026-09-21 | Claude | Rebuilt as the complete system: v2 schema (sessions/page views/events/carts/items/order items/internal visitors), atomic ingest + server-owned purchase functions, ~25 role-checked aggregate RPCs, hardened Edge Function (strict schemas, bot/test/internal filtering, verified identity, background coarse geo), batched storefront client with idle-aware engagement, instrumented cart/search/checkout/rails/promotions/navigation, 10 Admin pages + drawers + insights, tests (unit, SQL, Playwright, live e2e, scale). Superseded the never-deployed foundation. |
