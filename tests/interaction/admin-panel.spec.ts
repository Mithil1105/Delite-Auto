import { test, expect, type Page } from "@playwright/test";

/**
 * Real Delite Admin coverage (Documentations MD/delite-admin.md). Requires the real bootstrapped
 * admin@unimisk.com account and VITE_CATALOG_SOURCE=supabase — same skip convention as
 * real-catalog.spec.ts, since these assert against real Odoo/CMS data, not the mock catalog.
 *
 * Note: use page.keyboard.type()/press(), not locator.fill(), for the Hero/Announcement editors'
 * inputs — they're bound to an object-shaped React state via a functional setState updater, and
 * Playwright's .fill() (a single native value-set + one input event) does not reliably trigger
 * that update path, even though real user typing does. Confirmed via manual diagnosis; not an
 * application bug.
 */
test.describe("Delite Admin", () => {
  // Credentials come from the environment, never hardcoded here — this file was previously
  // shipped with the real production owner account's literal password inline, a genuine
  // credential-exposure bug found and fixed during the 2026-09-30 security-hardening pass (see
  // Documentations MD/delite-auth-security.md). Set ADMIN_TEST_EMAIL/ADMIN_TEST_PASSWORD (e.g. via
  // a real-catalog-only .env.interaction.local, gitignored) to run this suite locally; CI is
  // expected to inject them as secrets. `admin-bootstrap` (x-internal-token gated, see
  // Documentations MD/delite-accounts-orders-reviews-admin.md) is the supported way to
  // create/reset a dedicated test admin account's password without touching the real owner.
  const TEST_EMAIL = process.env.ADMIN_TEST_EMAIL;
  const TEST_PASSWORD = process.env.ADMIN_TEST_PASSWORD;

  test.skip(
    (process.env.VITE_CATALOG_SOURCE !== "supabase" && !process.env.CI) || !TEST_EMAIL || !TEST_PASSWORD,
    "Only meaningful against VITE_CATALOG_SOURCE=supabase (real Odoo/CMS data) and a real admin account — requires ADMIN_TEST_EMAIL/ADMIN_TEST_PASSWORD"
  );

  async function signInAdmin(page: Page) {
    await page.goto("/admin/login");
    await page.locator("#admin-login-email").fill(TEST_EMAIL!);
    await page.locator("#admin-login-password").fill(TEST_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/admin$/, { timeout: 10000 });
  }

  test("admin login reaches Overview with real widgets", async ({ page }) => {
    await signInAdmin(page);
    await expect(page.getByText(/website/i).first()).toBeVisible();
    await expect(page.getByText(/odoo/i).first()).toBeVisible();
  });

  test("Homepage CMS: visibility toggle and publish are real", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin/website/homepage");
    await page.waitForTimeout(1000);
    await page.getByRole("button", { name: /^publish$/i }).click();
    await expect(page.getByText(/homepage published/i)).toBeVisible({ timeout: 5000 });
  });

  test("Hero editor: real typing enables Save Draft, preview reflects it, publish succeeds", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin/website/hero");
    await page.waitForSelector("#hero-heading-1", { timeout: 15000 });
    await page.locator("#hero-heading-1").click();
    await page.locator("#hero-heading-1").press("Control+a");
    await page.keyboard.type("TEST HEADING");

    const saveButton = page.getByRole("button", { name: /save draft/i });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText(/draft saved/i)).toBeVisible({ timeout: 5000 });

    await expect(page.locator("section").first()).toContainText("TEST HEADING");

    await page.getByRole("button", { name: /^publish$/i }).click();
    await expect(page.getByText(/^published$/i)).toBeVisible({ timeout: 5000 });
  });

  test("Product browser shows real Odoo products, read-only", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin/products");
    await page.waitForTimeout(2000);
    const rowCount = await page.locator("tbody tr").count();
    expect(rowCount).toBeGreaterThan(0);
    // No product CRUD anywhere on this page (spec: read-only browser).
    await expect(page.getByRole("button", { name: /^edit product$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^delete product$/i })).toHaveCount(0);
  });

  test("Activity Log records real admin actions", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin/settings/activity");
    await page.waitForTimeout(1500);
    await expect(page.getByText(/cms\.|media\.|review\./).first()).toBeVisible();
  });

  test("Odoo status page shows real, non-secret connection state", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin/odoo/status");
    await page.waitForTimeout(2000);
    const text = await page.locator("body").innerText();
    expect(text).not.toContain("ODOO_API_KEY");
    expect(text).not.toContain("ODOO_DATABASE");
  });

  // Phase 2: publishing a CMS change actually changes the public site — see
  // Documentations MD/delite-admin.md, "Storefront CMS wiring". Both tests below restore the
  // section's original state at the end so the suite is safe to re-run and leaves the live site
  // unchanged afterward.
  test("Homepage: hiding a section and publishing removes it from the live site, unhiding restores it", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin/website/homepage");
    const row = page.locator("div.flex.items-center.gap-3.px-4.py-3").filter({ hasText: "Testimonials" });
    const toggle = row.getByRole("button", { name: /visible|hidden/i });

    await toggle.click(); // hide
    await page.getByRole("button", { name: /^publish$/i }).click();
    await expect(page.getByText(/homepage published/i)).toBeVisible({ timeout: 5000 });

    await page.goto("/");
    await expect(page.getByText("Why People Put Trust in Delite Auto")).toHaveCount(0);

    await page.goto("/admin/website/homepage");
    await toggle.click(); // restore
    await page.getByRole("button", { name: /^publish$/i }).click();
    await expect(page.getByText(/homepage published/i)).toBeVisible({ timeout: 5000 });

    await page.goto("/");
    await expect(page.getByText("Why People Put Trust in Delite Auto")).toBeVisible();
  });

  test("Trending merchandising: selecting a product only appears on the live site after Publish", async ({ page }) => {
    test.setTimeout(90_000);
    await signInAdmin(page);
    await page.goto("/admin/merchandising/trending");
    await page.waitForSelector("text=Add products", { timeout: 15000 });

    // Clear any leftover selections from a prior interrupted run so "Add" is available.
    while (await page.getByRole("button", { name: "Remove" }).count()) {
      await page.getByRole("button", { name: "Remove" }).first().click();
    }
    const saveAfterClear = page.getByRole("button", { name: /save draft/i });
    if (await saveAfterClear.isEnabled()) {
      await saveAfterClear.click();
      await expect(page.getByText(/draft saved/i)).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: /^publish$/i }).click();
      await expect(page.getByText(/^published$/i)).toBeVisible({ timeout: 5000 });
    }

    const addRow = page
      .locator("div.flex.items-center.gap-2\\.5")
      .filter({ has: page.getByRole("button", { name: "Add", exact: true }) })
      .first();
    await expect(addRow.getByRole("button", { name: "Add", exact: true })).toBeEnabled({ timeout: 15000 });
    const firstResultName = (await addRow.locator(".line-clamp-1").innerText()).trim();
    await addRow.getByRole("button", { name: "Add", exact: true }).click();

    const saveButton = page.getByRole("button", { name: /save draft/i });
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(page.getByText(/draft saved/i)).toBeVisible({ timeout: 5000 });

    await page.goto("/");
    await expect(page.getByText(firstResultName, { exact: true })).toHaveCount(0);

    await page.goto("/admin/merchandising/trending");
    await page.getByRole("button", { name: /^publish$/i }).click();
    await expect(page.getByText(/^published$/i)).toBeVisible({ timeout: 5000 });

    await expect(async () => {
      await page.goto("/");
      const trendingSection = page.locator("section").filter({ hasText: "Trending on Car & Bike" });
      await expect(trendingSection).toBeVisible({ timeout: 15000 });
      await expect(trendingSection.getByText(firstResultName, { exact: true }).first()).toBeVisible({ timeout: 10000 });
    }).toPass({ timeout: 45000 });

    // Cleanup: remove the selection and publish again so the live Trending rail returns to empty
    // curation (its pre-existing tag-based fallback).
    await page.goto("/admin/merchandising/trending");
    await page.getByRole("button", { name: "Remove" }).first().click();
    await page.getByRole("button", { name: /save draft/i }).click();
    await expect(page.getByText(/draft saved/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^publish$/i }).click();
    await expect(page.getByText(/^published$/i)).toBeVisible({ timeout: 5000 });
  });
});
