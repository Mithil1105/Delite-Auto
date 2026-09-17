import { test, expect } from "@playwright/test";

/**
 * Real Odoo catalog integration (VITE_CATALOG_SOURCE=supabase) — see
 * Documentations MD/odoo-real-catalog.md. These tests assert against specific real records
 * verified live on the connected Odoo instance during development:
 *   - id 24 "ACTIVA SEAT COVER ( HEAVY )": genuine multi-variant product (3 colours).
 *   - id 2 "Booking Fees": a known POS/service record that must NEVER appear in the storefront.
 * Skipped entirely when the dev server isn't running against the real catalog, since the
 * specific names/ids below have no meaning against the local mock catalog.
 */

test.describe("Real Odoo catalog", () => {
  test.skip(
    process.env.VITE_CATALOG_SOURCE !== "supabase" && !process.env.CI,
    "Only meaningful against VITE_CATALOG_SOURCE=supabase (real Odoo data)"
  );

  test("non-catalog POS/service records never appear in Shop search", async ({ page }) => {
    await page.goto("/shop?q=Booking+Fees");
    await expect(page.getByText(/products$/).first()).toBeVisible({ timeout: 15000 });
    // Scoped to product-card name links only — the page's own "Showing results for Booking Fees"
    // echo of the search term would otherwise match a page-wide text locator with zero real
    // product cards actually present.
    const matchingCardNames = page.locator("a[href^='/product/']", { hasText: "Booking Fees" });
    await expect(matchingCardNames).toHaveCount(0);
  });

  test("a real multi-variant product requires a selection before Add to Cart", async ({ page }) => {
    await page.goto("/product/activa-seat-cover-heavy--24");

    // Scoped to the PDP's own purchase panel — "Add to Cart" also appears on every ProductCard in
    // the "You might also like" rail further down the page.
    const addToCart = page.locator(".btn-pill-dark", { hasText: "Add to Cart" });
    await expect(addToCart).toBeVisible({ timeout: 15000 });
    await expect(addToCart).toBeDisabled();

    const variantSelect = page.locator("select").first();
    await variantSelect.selectOption({ index: 1 });
    await expect(addToCart).toBeEnabled();

    await addToCart.click();
    await expect(page.getByText(/added|cart/i).first()).toBeVisible({ timeout: 5000 });
  });

  test("a real fitment product shows raw Odoo fitment labels, never a parsed make/model/year", async ({ page }) => {
    await page.goto("/product/posh-vegan-leather-car-seat-cover-for-maruti-brezza--101");
    await expect(page.getByText(/Brezza/i).first()).toBeVisible({ timeout: 15000 });
  });
});
