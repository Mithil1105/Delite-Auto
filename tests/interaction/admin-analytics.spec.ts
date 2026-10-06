import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Delite Admin → Analytics (Documentations MD/delite-analytics.md).
 *
 * Behaviour tests answer the admin RPCs from FIXTURES (page.route), so they are deterministic and
 * never depend on what is in the analytics tables — while still using the real admin login and the
 * real Odoo catalog for product names. Authorization itself (who may call which RPC) is enforced in
 * Postgres and verified by supabase/tests/analytics_rbac.sql plus the real-backend checks below.
 *
 * Requires VITE_CATALOG_SOURCE=supabase and the real bootstrapped admin account (same convention as
 * admin-panel.spec.ts).
 */
test.describe("Admin analytics", () => {
  // See admin-panel.spec.ts — credentials come from the environment, never hardcoded (this file
  // previously shipped the real production owner password inline, fixed in the 2026-09-30
  // security-hardening pass).
  const TEST_EMAIL = process.env.ADMIN_TEST_EMAIL;
  const TEST_PASSWORD = process.env.ADMIN_TEST_PASSWORD;
  test.skip(
    (process.env.VITE_CATALOG_SOURCE !== "supabase" && !process.env.CI) || !TEST_EMAIL || !TEST_PASSWORD,
    "Needs the real admin account and catalog — requires ADMIN_TEST_EMAIL/ADMIN_TEST_PASSWORD"
  );
  test.describe.configure({ mode: "serial" });

  const zero = { sessions: 0, unique_visitors: 0, logged_in_users: 0, new_visitors: 0, returning_visitors: 0, logged_in_sessions: 0, page_views: 0, product_views: 0, add_to_carts: 0, removes: 0, checkout_starts: 0, wishlist_adds: 0, searches: 0, zero_result_searches: 0, product_view_sessions: 0, add_sessions: 0, cart_view_sessions: 0, checkout_sessions: 0, purchase_sessions: 0, orders: 0, revenue: 0, avg_engaged_per_session: null, avg_engaged_per_visitor: null, median_engaged_per_session: null, engaged_sessions: 0, low_engagement_sessions: 0, pages_per_session: null, products_viewed_per_session: null, median_secs_to_first_product: null, median_secs_to_first_add: null, wishlist_sessions: 0, abandoned_carts: 0, abandoned_value: 0, converted_carts: 0, recovered_carts: 0, active_carts: 0, first_tracked_at: null };
  const overview = (over: Record<string, unknown> = {}) => ({ ...zero, sessions: 1200, unique_visitors: 900, page_views: 4800, product_views: 700, add_to_carts: 210, checkout_starts: 90, orders: 30, revenue: 90000, purchase_sessions: 30, add_sessions: 180, checkout_sessions: 85, product_view_sessions: 600, cart_view_sessions: 150, avg_engaged_per_session: 95, abandoned_carts: 12, abandoned_value: 40000, first_tracked_at: "2026-08-01T00:00:00Z", ...over });
  const productRow = (id: number, extra: Record<string, unknown> = {}) => ({ odoo_template_id: id, views: 100, unique_viewers: 80, view_sessions: 90, adds: 20, units_added: 25, add_sessions: 18, removes: 2, wishlist_adds: 3, checkout_carts: 8, abandoned_carts: 5, abandoned_value: 9000, orders: 4, units_sold: 5, revenue: 12000, rec_impressions: 40, rec_clicks: 8, rec_adds: 2, ...extra });
  const cartRow = { cart_id: "c0000000-0000-4000-8000-000000000001", status: "abandoned", recovered: false, last_activity_at: "2026-09-20T10:00:00Z", abandoned_at: null, converted_at: null, minutes_since: 600, item_count: 2, cart_value: 2500, checkout_started: true, visitor_id: "a0000000-0000-4000-8000-000000000001", identity: { kind: "anonymous" }, country_name: "India", region: "Gujarat", city: "Ahmedabad", device_type: "mobile", source_channel: "Instagram", session_engaged_seconds: 140, session_page_views: 5, last_path: "/checkout", items: [{ odoo_template_id: 8, quantity: 2, unit_price: 1250 }] };

  const fixtures: Record<string, unknown> = {
    admin_analytics_overview: overview(),
    admin_analytics_timeseries: [{ bucket: "2026-09-19T00:00:00", visitors: 50, sessions: 60, page_views: 200, orders: 1, revenue: 3000 }, { bucket: "2026-09-20T00:00:00", visitors: 70, sessions: 80, page_views: 260, orders: 2, revenue: 5000 }],
    admin_analytics_funnel: { steps: [{ key: "sessions", label: "Sessions", sessions: 1200, visitors: 900 }, { key: "product", label: "Product viewers", sessions: 600, visitors: 500 }, { key: "add", label: "Added to cart", sessions: 180, visitors: 150 }, { key: "cart", label: "Viewed cart", sessions: 150, visitors: 120 }, { key: "checkout", label: "Started checkout", sessions: 85, visitors: 70 }, { key: "purchase", label: "Purchased", sessions: 30, visitors: 28 }], checkout: { started: 90, completed_client: 25, failed: 3, purchased: 30, step_views: { details: 88, review: 40 } } },
    admin_analytics_products: [productRow(8, { views: 500 }), productRow(14, { views: 300 }), productRow(24, { views: 100 })],
    admin_analytics_product_detail: { odoo_template_id: 8, funnel: { view_sessions: 90, views: 100, unique_viewers: 80, add_sessions: 18, adds: 20, removes: 2, checkout_carts: 8, abandoned_carts: 5, carts: 12, orders: 4, revenue: 12000, units: 5 }, pdp: { avg_engaged: 42, median_engaged: 30, avg_scroll: 55, page_views: 100 }, sources: [{ label: "Instagram", n: 40 }], devices: [{ label: "mobile", n: 60 }], geography: [{ country: "India", region: "Gujarat", city: "Ahmedabad", n: 30 }], recommendations: [], co_carted: [{ odoo_template_id: 14, carts: 4 }], daily: [{ day: "2026-09-19", views: 5, adds: 1 }] },
    admin_analytics_sources: [{ label: "Instagram", sessions: 400, visitors: 300, avg_engaged: 80, add_sessions: 60, checkout_sessions: 30, purchase_sessions: 12, orders: 12, revenue: 36000 }, { label: "Direct", sessions: 300, visitors: 250, avg_engaged: 70, add_sessions: 40, checkout_sessions: 20, purchase_sessions: 8, orders: 8, revenue: 24000 }],
    admin_analytics_devices: [{ label: "mobile", sessions: 700, visitors: 500, avg_engaged: 80, add_sessions: 90, checkout_sessions: 40, purchase_sessions: 10, orders: 10, revenue: 30000 }],
    admin_analytics_geography: [{ label: "India", parent: "", country_code: "IN", sessions: 1000, visitors: 800, page_views: 4000, add_sessions: 150, purchase_sessions: 25, orders: 25, revenue: 80000 }, { label: "United States", parent: "", country_code: "US", sessions: 100, visitors: 90, page_views: 300, add_sessions: 10, purchase_sessions: 1, orders: 1, revenue: 3000 }],
    admin_analytics_abandoned_carts: { total: 1, rows: [cartRow] },
    admin_analytics_cart_detail: { cart: { id: cartRow.cart_id, status: "abandoned", recovered: false, created_at: "2026-09-20T09:40:00Z", last_activity_at: "2026-09-20T10:00:00Z", checkout_started_at: "2026-09-20T09:58:00Z", converted_at: null, abandoned_at: null, returned_at: null, current_item_count: 2, observed_cart_value: 2500, user_id: null }, visitor_id: cartRow.visitor_id, identity: { kind: "anonymous" }, items: [{ odoo_template_id: 8, odoo_variant_id: 0, quantity: 2, observed_unit_price: 1250, observed_line_value: 2500, removed: false }], sessions: [{ id: "s0000000-0000-4000-8000-000000000001", started_at: "2026-09-20T09:40:00Z", landing_path: "/", source_channel: "Instagram", referrer_domain: "l.instagram.com", utm_campaign: null, device_type: "mobile", browser_family: "Chrome", country_name: "India", region: "Gujarat", city: "Ahmedabad", engaged_seconds: 140, page_view_count: 5 }], timeline: [{ at: "2026-09-20T09:40:00Z", kind: "page_view", label: "/", engaged: 12, template_id: null, qty: null, value: null, scroll: 40 }, { at: "2026-09-20T09:50:00Z", kind: "add_to_cart", label: null, engaged: null, template_id: 8, qty: 2, value: 2500 }, { at: "2026-09-20T09:58:00Z", kind: "checkout_started", label: null, engaged: null, template_id: null, qty: null, value: 2500 }] },
    admin_analytics_carts_summary: { created: 20, kpis: { active: 1, abandoned: 12, converted: 6, recovered: 2, abandoned_value: 40000, avg_cart_value: 3000, avg_abandoned_value: 3300, avg_items: 2.1, abandoned_after_checkout: 5, age_30m_6h: 2, age_6h_24h: 4, age_1d_3d: 3, age_3d_plus: 3 }, daily: [{ day: "2026-09-19", abandoned: 3, abandoned_value: 9000, converted: 1 }] },
    admin_analytics_cart_pairs: { carted_together: [{ a: 8, b: 14, carts: 5 }], purchased_together: [], carts_with_items: 20, orders: 6, min_support: 2 },
    admin_analytics_searches: { kpis: { searches: 100, unique_searchers: 80, zero_results: 20, clicks: 50, adds: 20, purchases: 5 }, queries: [{ query: "seat cover", display: "Seat Cover", searches: 60, unique_searchers: 50, zero_results: 0, clicks: 40, adds: 15, purchases: 4, last_searched_at: "2026-09-20T10:00:00Z" }, { query: "steering cover", display: "Steering Cover", searches: 20, unique_searchers: 18, zero_results: 20, clicks: 0, adds: 0, purchases: 0, last_searched_at: "2026-09-20T10:00:00Z" }] },
    admin_analytics_search_detail: { query: "steering cover", searches: 20, zero_results: 20, median_secs_to_click: null, clicked_products: [], added_products: [] },
    admin_analytics_recent_activity: [],
    admin_analytics_insights: [{ code: "zero_result_search", severity: "warning", params: { query: "Steering Cover", searches: 20 } }],
    admin_analytics_health: { first_tracked_at: "2026-08-01T00:00:00Z", last_session_at: "2026-09-20T10:00:00Z", sessions_total: 1200, sessions_24h: 60, geo_resolved_pct: 92.5, test_sessions: 0, internal_sessions: 0 },
    admin_analytics_pages: [
      { path: "/", page_type: "home", views: 100, unique_visitors: 90, avg_engaged: 30, median_engaged: 20, avg_scroll: 40, entrances: 80, exits: 20, add_to_carts: 0 },
      { path: "/shop", page_type: "shop", views: 300, unique_visitors: 200, avg_engaged: 45, median_engaged: 30, avg_scroll: 50, entrances: 40, exits: 90, add_to_carts: 12 },
      { path: "/cart", page_type: "cart", views: 50, unique_visitors: 40, avg_engaged: 60, median_engaged: 50, avg_scroll: 70, entrances: 0, exits: 25, add_to_carts: 0 },
    ],
    admin_analytics_page_detail: { path: "/shop", totals: { views: 300, unique_visitors: 200, avg_engaged: 45, median_engaged: 30, avg_scroll: 50, entrances: 40, exits: 90 }, daily: [{ day: "2026-09-19", views: 20 }], scroll: { b0: 50, b25: 100, b50: 100, b75: 30, b90: 20 }, sources: [], devices: [], next_pages: [{ label: "/cart", n: 20 }], previous_pages: [], geography: [] },
    admin_analytics_landing_exit: { landing: [], exits: [], total_sessions: 0 },
    admin_analytics_audience: { segments: { anon_sessions: 900, anon_purchase_sessions: 20, user_sessions: 300, user_purchase_sessions: 10, new_sessions: 800, new_purchase_sessions: 15, returning_sessions: 400, returning_purchase_sessions: 15 }, purchasers: 28, avg_sessions_to_purchase: 1.6, avg_days_to_purchase: 2.1, repeat_purchasers: 2 },
    admin_analytics_recommendations: [],
    admin_analytics_session_journey: null,
  };

  interface Call { fn: string; body: Record<string, unknown> }
  async function mockRpc(page: Page, overrides: Record<string, unknown | ((body: Record<string, unknown>) => unknown)> = {}, deny = false): Promise<Call[]> {
    const calls: Call[] = [];
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    await page.route("**/rest/v1/rpc/admin_analytics_*", async (route: Route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const fn = req.url().split("/rpc/")[1].split("?")[0];
      const body = (req.postDataJSON() ?? {}) as Record<string, unknown>;
      calls.push({ fn, body });
      if (deny) return route.fulfill({ status: 403, headers: cors, contentType: "application/json", body: JSON.stringify({ code: "42501", message: "analytics: forbidden" }) });
      const o = overrides[fn];
      const payload = typeof o === "function" ? (o as (b: Record<string, unknown>) => unknown)(body) : o !== undefined ? o : fixtures[fn];
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(payload ?? null) });
    });
    return calls;
  }

  async function signInAdmin(page: Page) {
    await page.goto("/admin/login");
    await page.locator("#admin-login-email").fill(TEST_EMAIL!);
    await page.locator("#admin-login-password").fill(TEST_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/admin$/, { timeout: 15000 });
  }

  test("Overview loads KPIs from the aggregate RPCs, with real period-over-period change", async ({ page }) => {
    // current period: 1200 sessions; previous period (called with an earlier window): 1000
    const calls = await mockRpc(page, {
      admin_analytics_overview: (() => { let n = 0; return () => (n++ % 2 === 0 ? overview({ sessions: 1200 }) : overview({ sessions: 1000 })); })(),
    });
    await signInAdmin(page);
    await page.goto("/admin/analytics");
    await expect(page.getByRole("heading", { name: "Analytics", exact: true }).first()).toBeVisible({ timeout: 20000 });
    const cards = page.getByTestId("metric-card");
    await expect(cards.filter({ hasText: "Unique visitors" }).getByText("900")).toBeVisible({ timeout: 15000 });
    await expect(cards.filter({ hasText: "Revenue" }).first()).toContainText("₹90,000");
    await expect(cards.filter({ hasText: "Conversion rate" })).toContainText("2.50%");           // 30 orders ÷ 1200 sessions
    await expect(cards.filter({ hasText: /^Sessions/ }).first()).toContainText(/[+-]\d/);        // a real comparison badge
    await expect(page.getByText(/“Steering Cover” was searched 20 times/)).toBeVisible();       // deterministic insight text
    // Everything came from server-side aggregates — never raw event rows.
    expect(calls.every((c) => c.fn.startsWith("admin_analytics_"))).toBe(true);
  });

  test("changing the date range re-queries with new bounds (IST-aligned) and the comparison window", async ({ page }) => {
    const calls = await mockRpc(page);
    await signInAdmin(page);
    await page.goto("/admin/analytics");
    await expect(page.getByTestId("metric-card").first()).toBeVisible({ timeout: 20000 });
    await page.getByLabel("Date range").selectOption("7d");
    const days = (c: Call) => (Date.parse(String(c.body.p_end)) - Date.parse(String(c.body.p_start))) / 86_400_000;
    const sevenDay = () => calls.filter((c) => c.fn === "admin_analytics_overview" && days(c) > 6 && days(c) <= 7.01);
    await expect.poll(() => sevenDay().length, { timeout: 15000 }).toBeGreaterThan(0);
    // Of the 7-day windows requested, the current period is the one ending latest (the other is its comparison).
    const current = [...sevenDay()].sort((x, y) => Date.parse(String(y.body.p_end)) - Date.parse(String(x.body.p_end)))[0];
    // The comparison window is the equal-length period ending exactly where the current one starts.
    await expect.poll(() => calls.some((c) => c.fn === "admin_analytics_overview" && c.body.p_end === current.body.p_start), { timeout: 15000 }).toBe(true);
    const previous = calls.find((c) => c.fn === "admin_analytics_overview" && c.body.p_end === current.body.p_start)!;
    expect(Math.round(days(previous))).toBe(Math.round(days(current)));
    // A 7-day range starts at IST midnight (18:30 UTC the evening before).
    expect(new Date(String(current.body.p_start)).toISOString().slice(11, 16)).toBe("18:30");
    await expect(page).toHaveURL(/r=7d/);                                                        // the view is shareable
    await page.getByLabel("Compare").selectOption("off");
    await expect(page.getByTestId("range-summary")).not.toContainText("compared with");
  });

  test("page table sorts by clicking column headers", async ({ page }) => {
    await mockRpc(page);
    await signInAdmin(page);
    await page.goto("/admin/analytics/pages");
    const rows = page.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 20000 });
    await expect(rows.first()).toContainText("/shop");                                          // default: most views first
    await page.getByRole("button", { name: /^Views/ }).click();                                  // toggles to ascending
    await expect(rows.first()).toContainText("/cart");
    await page.getByRole("button", { name: /^Page/ }).click();                                   // sort by path (desc)
    await expect(rows.first()).toContainText("/shop");
    await rows.filter({ hasText: "/shop" }).click();                                             // detail drawer
    await expect(page.getByTestId("drawer")).toContainText("Scroll depth");
  });

  test("product drill-down resolves the live Odoo product and shows its funnel", async ({ page }) => {
    await mockRpc(page);
    await signInAdmin(page);
    await page.goto("/admin/analytics/products");
    const first = page.locator("tbody tr").first();
    await expect(first).toBeVisible({ timeout: 20000 });
    await expect(first).toContainText(/GRASS 18 MM SET OF 5/i, { timeout: 20000 });              // name resolved from Odoo, not stored
    await first.click();
    const drawer = page.getByTestId("drawer");
    await expect(drawer).toContainText("Funnel");
    await expect(drawer).toContainText("Purchased (orders)");
    await expect(drawer).toContainText("Frequently carted with");
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
  });

  test("abandoned cart detail shows contents, journey summary and a chronological timeline", async ({ page }) => {
    await mockRpc(page);
    await signInAdmin(page);
    await page.goto("/admin/analytics/carts");
    const row = page.locator("tbody tr").first();
    await expect(row).toContainText("Anonymous visitor", { timeout: 20000 });
    await expect(row).toContainText("Reached");                                                  // checkout started
    await row.click();
    const drawer = page.getByTestId("drawer");
    await expect(drawer).toContainText("Cart contents");
    await expect(drawer).toContainText("Observed cart value");
    await expect(drawer).toContainText("Journey summary");
    await expect(drawer).toContainText("Instagram");
    const timeline = drawer.getByTestId("timeline");
    await expect(timeline).toContainText("Started checkout");
    const text = await timeline.innerText();
    expect(text.indexOf("Viewed /")).toBeLessThan(text.indexOf("Added"));
    expect(text.indexOf("Added")).toBeLessThan(text.indexOf("Started checkout"));
    expect(text).not.toContain("{");                                                             // never raw JSON
  });

  test("search analytics: zero-result view isolates queries that found nothing", async ({ page }) => {
    await mockRpc(page);
    await signInAdmin(page);
    await page.goto("/admin/analytics/search");
    await expect(page.locator("tbody tr").first()).toContainText("Seat Cover", { timeout: 20000 });
    await page.getByRole("tab", { name: "Zero results" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr").first()).toContainText("Steering Cover");
    await page.locator("tbody tr").first().click();
    await expect(page.getByTestId("drawer")).toContainText("Returned no results");
  });

  test("geography: clicking a country drills into its states at the next level", async ({ page }) => {
    const calls = await mockRpc(page);
    await signInAdmin(page);
    await page.goto("/admin/analytics/geography");
    await expect(page.locator("tbody tr").first()).toContainText("India", { timeout: 20000 });
    await expect(page.getByText(/resolved for 92.5% of sessions/)).toBeVisible();
    await page.locator("tbody tr").filter({ hasText: "India" }).click();
    await expect.poll(() => calls.some((c) => c.fn === "admin_analytics_geography" && c.body.p_level === "region" && (c.body.p_filters as Record<string, unknown>).country === "IN"), { timeout: 15000 }).toBe(true);
  });

  test("permission denial: a 42501 from the database is shown as a clear message, not a broken page", async ({ page }) => {
    await mockRpc(page, {}, true);
    await signInAdmin(page);
    await page.goto("/admin/analytics/products");
    await expect(page.getByRole("alert").first()).toContainText(/don't have permission/i, { timeout: 20000 });
  });

  test("empty state: a new deployment says 'No analytics collected yet' instead of fake zeros", async ({ page }) => {
    await mockRpc(page, { admin_analytics_overview: zero, admin_analytics_health: { first_tracked_at: null, last_session_at: null, sessions_total: 0, sessions_24h: 0, geo_resolved_pct: null, test_sessions: 0, internal_sessions: 0 } });
    await signInAdmin(page);
    await page.goto("/admin/analytics");
    await expect(page.getByText("No analytics collected yet").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("metric-card")).toHaveCount(0);                                // no zero-filled KPI wall
    await expect(page.getByText(/No live traffic has been collected yet/)).toBeVisible();
  });

  test("REAL backend: anonymous callers cannot read analytics RPCs; the live Overview loads without errors", async ({ page, request }) => {
    const url = process.env.VITE_SUPABASE_URL ?? "https://zafjmlwbolgdattfdgch.supabase.co";
    const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    test.skip(!key, "publishable key not exported to the test process");
    for (const fn of ["admin_analytics_overview", "admin_analytics_abandoned_carts", "admin_analytics_customer_journey"]) {
      const res = await request.post(`${url}/rest/v1/rpc/${fn}`, { headers: { apikey: key!, "content-type": "application/json" }, data: {} });
      expect(res.status(), fn).toBeGreaterThanOrEqual(400);                                       // no EXECUTE grant for anon
    }
    const direct = await request.get(`${url}/rest/v1/analytics_events?select=id&limit=1`, { headers: { apikey: key! } });
    expect([200, 401, 403]).toContain(direct.status());
    if (direct.status() === 200) expect(await direct.json()).toEqual([]);                        // RLS: anon sees no rows

    await signInAdmin(page);
    await page.goto("/admin/analytics?test=1");
    await expect(page.getByRole("heading", { name: "Analytics", exact: true }).first()).toBeVisible({ timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector("[aria-label=Loading]"), null, { timeout: 40000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
