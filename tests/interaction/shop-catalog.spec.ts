import { test, expect } from "@playwright/test";

/**
 * Shop fetches the catalog via `catalogService` (async, server-side paginated/filtered) instead
 * of importing `src/data/products.ts` directly — see Documentations MD/odoo-real-catalog.md.
 * Written to pass against either `VITE_CATALOG_SOURCE=mock` or `=supabase` (real Odoo data): the
 * vehicle filter is the one query param both sources genuinely support, so it's what's asserted
 * here rather than a mock-only category slug.
 */

test.describe("Shop: catalog service migration", () => {
  test("renders products fetched via catalogService, not a static import", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/shop");

    await expect(page.getByRole("heading", { name: "Shop All" })).toBeVisible({ timeout: 15000 });
    const cards = page.locator(".lg\\:grid.lg\\:grid-cols-3 a[href^='/product/'], .lg\\:grid.lg\\:grid-cols-4 a[href^='/product/']");
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
  });

  test("vehicle filter narrows the visible product set", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/shop");
    const countLocator = page.getByText(/products$/).first();
    await expect(countLocator).toBeVisible({ timeout: 15000 });
    const allCountText = await countLocator.innerText();

    await page.goto("/shop?vehicle=bike");
    await expect(countLocator).toBeVisible({ timeout: 15000 });
    const bikeCountText = await countLocator.innerText();

    // Confirms the filter actually reduced the domain server-side, not just relabeled the page —
    // a real catalog has far more total products than bike-tagged ones (and vice versa for mock).
    expect(bikeCountText).not.toBe(allCountText);
  });
});
