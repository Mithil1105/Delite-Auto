import { test, expect } from "@playwright/test";

/**
 * Real bug, found from a user screenshot (2026-09-17): at least one real product's `image_1920`
 * field is 5108×5479px / 909KB — far beyond what that field name promises (Odoo caps it at 1920px
 * on the long edge; this record's value didn't honor that, a genuine upstream Odoo data-quality
 * issue). Chromium silently refuses to decode an image that large (`naturalWidth` stays 0, no
 * console error, no failed network request), which showed up as a broken-image placeholder icon.
 * Fixed by defaulting the media proxy to `image_1024` instead — see
 * Documentations MD/odoo-real-catalog.md, "Media behavior". This test asserts the real fix on the
 * real record, not a synthetic case.
 */
test.describe("Product images", () => {
  test.skip(
    process.env.VITE_CATALOG_SOURCE !== "supabase" && !process.env.CI,
    "Only meaningful against VITE_CATALOG_SOURCE=supabase (real Odoo data)"
  );

  test("a product whose image_1920 is anomalously oversized still renders a real photo", async ({ page }) => {
    await page.goto("/product/gussi-grass-set-of-5-graey-black--14");
    const img = page.locator('img[src*="catalog-media"]').first();
    await expect(img).toBeVisible({ timeout: 15000 });
    await expect
      .poll(async () => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 10000 })
      .toBeGreaterThan(0);
  });
});
