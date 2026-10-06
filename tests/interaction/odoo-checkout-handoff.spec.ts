import { test, expect, type Page } from "@playwright/test";

/**
 * React → Odoo native checkout handoff — see Documentations MD/odoo-native-checkout.md. The
 * production checkout path is now "hand the cart off to Odoo's own checkout", not our own custom
 * Checkout.tsx flow. These tests verify the real browser is told to navigate to the correct Odoo
 * handoff URL with a correctly-shaped payload.
 *
 * Deliberately does NOT try to intercept/block the resulting cross-origin request — manual
 * testing showed `window.location.assign()` performs a real top-level navigation that Playwright's
 * `page.route()` does not reliably catch for this case, and a `window.location` property-override
 * stub doesn't survive real navigation either (browsers don't let JS fully replace `.assign()`
 * that way). The target page doesn't exist in Odoo yet at the time of writing (a 404, same as any
 * wrong URL) — a single harmless GET, no order/payment/customer data created either way. Instead
 * these tests observe the browser's own address bar via `waitForURL`, which updates as part of a
 * real navigation regardless of the eventual response.
 */

function decodePayload(url: string) {
  return JSON.parse(decodeURIComponent(url.split("#")[1]));
}

async function addFirstProduct(page: Page) {
  await page.goto("/shop");
  // Not networkidle — the live Odoo-backed catalog + background analytics never fully go idle
  // (same pre-existing flakiness documented against other specs in this suite). Wait for a real
  // Add to Cart button to actually render instead.
  const addToCart = page.locator("button:has-text('Add to Cart'):visible").first();
  await addToCart.waitFor({ state: "visible", timeout: 45_000 });
  await addToCart.click();
}

const HANDOFF_URL_PATTERN = /^https:\/\/www\.deliteauto\.com\/checkout-handoff-test#/;

test.describe("Odoo checkout handoff", () => {
  test("Cart page Checkout button navigates to the Odoo handoff URL", async ({ page }) => {
    await addFirstProduct(page);
    await page.goto("/cart");
    const checkoutBtn = page.locator("button", { hasText: "Checkout" }).first();
    await checkoutBtn.waitFor({ state: "visible", timeout: 40_000 });

    await checkoutBtn.click();
    await page.waitForURL(HANDOFF_URL_PATTERN, { timeout: 40_000 });
    const url = page.url();

    const payload = decodePayload(url);
    expect(payload.v).toBe(1);
    expect(Array.isArray(payload.lines)).toBe(true);
    expect(payload.lines.length).toBeGreaterThan(0);
    for (const line of payload.lines) {
      expect(Number.isInteger(line.productId)).toBe(true);
      expect(Number.isInteger(line.productTemplateId)).toBe(true);
      expect(Number.isInteger(line.quantity)).toBe(true);
      // Never leaks price/tax/discount/shipping/total — Odoo is sole authority for those.
      expect(line).not.toHaveProperty("price");
      expect(line).not.toHaveProperty("tax");
      expect(line).not.toHaveProperty("total");
    }
  });

  test("Cart drawer Checkout button navigates to the Odoo handoff URL", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await addFirstProduct(page);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator("button", { hasText: "Checkout" }).click();

    await page.waitForURL(HANDOFF_URL_PATTERN, { timeout: 40_000 });
  });

  test("/checkout with a non-empty cart shows a redirect state then navigates to the Odoo handoff URL", async ({ page }) => {
    await addFirstProduct(page);
    await page.goto("/checkout");

    await expect(page.getByText(/Redirecting to secure checkout/i)).toBeVisible();
    await page.waitForURL(HANDOFF_URL_PATTERN, { timeout: 40_000 });
  });

  test("/checkout with an empty cart redirects to /cart, never to Odoo", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/cart$/);
  });
});
