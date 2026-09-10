import { test, expect, type Page } from "@playwright/test";

/**
 * Cart-drawer cross-sell recommendations — see
 * Documentations MD/personalized-product-recommendations.md. Covers spec section 17 items E
 * (Quick Add: adds to cart, disappears from the rail, subtotal updates, drawer stays open) and G
 * (recommendations disappear once the cart is empty). Items A–D, F, H, I are pure scoring-logic
 * tests in src/lib/recommendations/engine.test.ts instead.
 */

const DESKTOP = { width: 1440, height: 900 };

async function addFirstProduct(page: Page) {
  await page.locator("button:has-text('Add to Cart'):visible").first().click();
}

test.describe("Cart drawer: YOU MIGHT ALSO NEED", () => {
  test("appears after adding a product, above the sticky subtotal/checkout footer", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    await addFirstProduct(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("You Might Also Need")).toBeVisible();
    // Footer (subtotal + View Cart) must still be visible without scrolling the recommendations away.
    await expect(dialog.getByText("Subtotal")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "View Cart" })).toBeVisible();
  });

  test("Quick Add: adds the product, updates the subtotal, keeps the drawer open, and removes it from the rail", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    await addFirstProduct(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("You Might Also Need")).toBeVisible();

    const quickAddButtons = dialog.getByRole("button", { name: "Quick Add" });
    await expect(quickAddButtons.first()).toBeVisible();
    const recommendationRail = dialog.locator("h3:has-text('You Might Also Need') + div");
    // Each recommendation row renders two <a> (image, then name+price) before its Quick Add
    // button — nth(1) is the first row's name+price link; its first child div is just the name.
    const recommendedName = await recommendationRail.locator("a").nth(1).locator("div").first().innerText();

    const subtotalBefore = await dialog.locator("text=Subtotal").locator("xpath=..").innerText();

    await quickAddButtons.first().click();

    // Drawer stays open — no re-triggered open animation, no navigation away.
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(/\/shop/);

    // Cart line list now contains the just-added product.
    await expect(dialog.getByText(recommendedName, { exact: true }).first()).toBeVisible();

    // Subtotal changed (a second item's price was added).
    const subtotalAfter = await dialog.locator("text=Subtotal").locator("xpath=..").innerText();
    expect(subtotalAfter).not.toBe(subtotalBefore);

    // Re-ranked rail no longer offers the product that was just added (already-in-cart exclusion).
    const stillOffered = await recommendationRail.getByText(recommendedName, { exact: true }).count();
    expect(stillOffered).toBe(0);
  });

  test("disappears once the cart is emptied", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    await addFirstProduct(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("You Might Also Need")).toBeVisible();

    await dialog.getByRole("button", { name: "Remove" }).first().click();
    await expect(dialog.getByText(/cart is empty/i)).toBeVisible();
    await expect(dialog.getByText("You Might Also Need")).not.toBeVisible();
  });
});
