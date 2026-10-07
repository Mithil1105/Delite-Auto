import { test, expect, type Page, type Request } from "@playwright/test";

/**
 * Storefront analytics collection (Documentations MD/delite-analytics.md).
 *
 * The ingestion endpoint is MOCKED (page.route) — every request is captured and answered 200 by
 * the test itself, so nothing here ever reaches the real analytics tables. Tracking is switched on
 * with the same `delite-analytics-debug` flag a developer would use (Playwright otherwise
 * self-disables analytics via navigator.webdriver, which is exactly what keeps automated traffic
 * out of production numbers).
 *
 * Requires VITE_CATALOG_SOURCE=supabase (real Odoo product 8) and the real admin account for the
 * signed-in checkout step — same skip convention as the other real-data specs.
 */
test.describe("Storefront analytics collection (mocked endpoint)", () => {
  // See admin-panel.spec.ts — credentials come from the environment, never hardcoded (this file
  // previously shipped the real production owner password inline, fixed in the 2026-09-30
  // security-hardening pass).
  const TEST_EMAIL = process.env.ADMIN_TEST_EMAIL;
  const TEST_PASSWORD = process.env.ADMIN_TEST_PASSWORD;
  test.skip(
    (process.env.VITE_CATALOG_SOURCE !== "supabase" && !process.env.CI) || !TEST_EMAIL || !TEST_PASSWORD,
    "Needs the real catalog (product 8) and a real account — requires ADMIN_TEST_EMAIL/ADMIN_TEST_PASSWORD"
  );
  test.describe.configure({ mode: "serial" });

  interface Captured { headers: Record<string, string>; body: { session: Record<string, unknown>; page_views?: Record<string, unknown>[]; engagements?: Record<string, unknown>[]; events?: Record<string, unknown>[]; cart?: Record<string, unknown> } }

  async function instrument(page: Page, opts: { debug?: boolean } = { debug: true }) {
    const captured: Captured[] = [];
    await page.route("**/functions/v1/analytics-track**", async (route) => {
      const req: Request = route.request();
      const raw = req.postData() ?? "";
      try { captured.push({ headers: req.headers(), body: JSON.parse(raw) }); } catch { /* beacon text/plain body */ }
      await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"ok":true}' });
    });
    if (opts.debug !== false) await page.addInitScript(() => localStorage.setItem("delite-analytics-debug", "1"));
    return captured;
  }
  const flat = (c: Captured[], key: "events" | "page_views" | "engagements") => c.flatMap((x) => (x.body[key] ?? []) as Record<string, unknown>[]);
  const spaNavigate = (page: Page, url: string) =>
    page.evaluate((u) => { window.history.pushState({}, "", u); window.dispatchEvent(new PopStateEvent("popstate")); }, url);

  test("automated browsers are excluded by default: no tracking without the explicit debug flag", async ({ page }) => {
    const captured = await instrument(page, { debug: false });
    await page.goto("/");
    await page.waitForTimeout(2500);
    expect(captured).toHaveLength(0);
  });

  test("journey Home → Shop → PDP → Add → Cart → Checkout produces the expected page views and events", async ({ page }) => {
    test.setTimeout(120_000);                                          // real Odoo catalog + sign-in: needs headroom
    const captured = await instrument(page);
    await page.goto("/");
    await page.waitForTimeout(1800);                                   // dwell so engagement accrues

    await spaNavigate(page, "/shop?category=all&utm_source=leak&token=SECRET");
    await page.waitForTimeout(1200);
    await spaNavigate(page, "/product/grass-18-mm-set-of-5--8");
    await page.getByRole("button", { name: /add to cart/i }).first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /add to cart/i }).first().click();
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");                              // close the cart drawer that opens on desktop
    await spaNavigate(page, "/cart");
    await page.waitForTimeout(1200);

    // Sign in with the real account (token verification path), then reach checkout WITHOUT placing an order.
    await spaNavigate(page, "/login");
    await page.locator("#login-email").fill(TEST_EMAIL!);
    await page.locator("#login-password").fill(TEST_PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).first().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
    await spaNavigate(page, "/checkout");
    await page.getByText(/shipping/i).first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500);
    await spaNavigate(page, "/");                                       // leave checkout so its page view closes out
    await page.waitForTimeout(3500);                                    // final interval flush

    const views = flat(captured, "page_views").map((v) => v.path);
    expect(views).toEqual(expect.arrayContaining(["/", "/shop", "/product/grass-18-mm-set-of-5--8", "/cart", "/login", "/checkout"]));
    // Order of first occurrence follows the journey.
    const first = (p: string) => views.indexOf(p);
    expect(first("/")).toBeLessThan(first("/shop"));
    expect(first("/shop")).toBeLessThan(first("/product/grass-18-mm-set-of-5--8"));
    expect(first("/product/grass-18-mm-set-of-5--8")).toBeLessThan(first("/cart"));
    expect(first("/cart")).toBeLessThan(first("/checkout"));

    // Privacy: no query strings or sensitive params ever leave the browser.
    expect(JSON.stringify(captured.map((c) => c.body))).not.toContain("SECRET");
    expect(views.every((p) => typeof p === "string" && !p.includes("?"))).toBe(true);
    // The product page carries the Odoo template id parsed from the slug.
    expect(flat(captured, "page_views").find((v) => v.path === "/product/grass-18-mm-set-of-5--8")?.odoo_template_id).toBe(8);

    const events = flat(captured, "events");
    const names = events.map((e) => e.event_name);
    expect(names).toEqual(expect.arrayContaining(["product_view", "add_to_cart", "cart_viewed", "checkout_started", "checkout_step_viewed"]));
    expect(names).not.toContain("purchase");                            // browsers can never emit a purchase
    const add = events.find((e) => e.event_name === "add_to_cart")!;
    expect(add.odoo_template_id).toBe(8);
    expect(add.quantity).toBe(1);
    expect(typeof add.value).toBe("number");
    expect(events.filter((e) => e.event_name === "product_view")).toHaveLength(1);   // once per page view, despite StrictMode

    // Every batch is one consistent test session; ids are random UUIDs; nothing identifies the user client-side.
    const sessions = new Set(captured.map((c) => c.body.session.id));
    expect(sessions.size).toBe(1);
    expect(captured.every((c) => c.body.session.env === "test")).toBe(true);
    expect(JSON.stringify(captured.map((c) => c.body))).not.toMatch(/user_id|admin@unimisk/);

    // Cart snapshot (observed price, Odoo ids) accompanied the add.
    const withCart = captured.map((c) => c.body.cart).filter(Boolean) as { items: { odoo_template_id: number; quantity: number }[] }[];
    expect(withCart.some((c) => c.items.some((i) => i.odoo_template_id === 8 && i.quantity === 1))).toBe(true);

    // Engagement: dwell time and scroll depth were reported as cumulative values.
    const eng = flat(captured, "engagements");
    expect(eng.some((e) => Number(e.engaged_seconds) >= 1)).toBe(true);
    expect(eng.every((e) => Number(e.engaged_seconds) <= 60 && Number(e.max_scroll_percent) <= 100)).toBe(true);

    // After sign-in the token travels in a header (server verifies it); before sign-in, no auth header.
    const authed = captured.filter((c) => c.headers["authorization"]);
    const anonymousBefore = captured.slice(0, 2);
    expect(anonymousBefore.every((c) => !c.headers["authorization"])).toBe(true);
    expect(authed.length).toBeGreaterThan(0);
  });

  test("hiding the tab flushes immediately (pagehide/visibility path) and stops accruing engaged time", async ({ page }) => {
    const captured = await instrument(page);
    await page.goto("/about");
    await page.waitForTimeout(1500);
    const before = flat(captured, "engagements").length;
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(700);
    const eng = flat(captured, "engagements");
    expect(eng.length).toBeGreaterThan(before);
    const atHide = Number(eng.at(-1)!.engaged_seconds);
    await page.waitForTimeout(2500);                                   // still hidden: must not grow
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const after = Number(flat(captured, "engagements").at(-1)!.engaged_seconds);
    expect(after).toBeLessThanOrEqual(atHide + 0.25);
  });

  test("admin pages are never tracked", async ({ page }) => {
    const captured = await instrument(page);
    await page.goto("/admin/login");
    await page.waitForTimeout(2500);
    expect(flat(captured, "page_views")).toHaveLength(0);
  });

  test("a failing analytics endpoint never breaks shopping", async ({ page }) => {
    await page.route("**/functions/v1/analytics-track**", (route) => route.abort("failed"));
    await page.addInitScript(() => localStorage.setItem("delite-analytics-debug", "1"));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto("/product/grass-18-mm-set-of-5--8");
    const add = page.getByRole("button", { name: /add to cart/i }).first();
    await add.waitFor({ timeout: 20000 });
    await add.click();
    await page.waitForTimeout(1500);
    await expect(page.getByLabel(/cart/i).first()).toBeVisible();
    expect(errors).toEqual([]);
    const cart = await page.evaluate(() => localStorage.getItem("delite-auto-cart"));
    expect(cart).toContain("GRASS");                                    // the cart still updated
  });
});
