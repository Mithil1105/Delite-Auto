import { test, expect, type Page } from "@playwright/test";

/**
 * Responsive cart drawer / Add-to-Cart feedback — see
 * Documentations MD/responsive-cart-drawer.md. Breakpoint is 700px (not Tailwind's md/768px).
 */

const DESKTOP = { width: 1440, height: 900 };
const TABLET = { width: 820, height: 1180 };
const MOBILE = { width: 390, height: 844 };

async function addFirstProduct(page: Page) {
  await page.locator("button:has-text('Add to Cart'):visible").first().click();
}

test.describe("Tablet/desktop: drawer", () => {
  for (const [label, viewport] of Object.entries({ tablet: TABLET, desktop: DESKTOP })) {
    test(`${label}: Add to Cart opens the drawer with the full cart, subtotal, and no navigation`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/shop");
      await page.waitForLoadState("networkidle");

      await addFirstProduct(page);
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(page).toHaveURL(/\/shop/); // stayed on the current page
      await expect(dialog.getByText(/1 items/)).toBeVisible();
      await expect(dialog.getByText("Subtotal")).toBeVisible();

      const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      expect(noOverflow).toBe(true);
    });
  }

  test("re-adding the same product increments quantity, not a duplicate line", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");

    await addFirstProduct(page);
    const qtyOf = (n = 0) =>
      page.getByRole("dialog").locator('button[aria-label="Increase quantity"]').nth(n).locator("xpath=preceding-sibling::span[1]");
    await expect(qtyOf()).toHaveText("1");

    await page.locator('button[aria-label="Close cart"]').click();
    await addFirstProduct(page);
    await expect(qtyOf()).toHaveText("2");
    await expect(page.getByRole("dialog").locator('button[aria-label="Increase quantity"]')).toHaveCount(1);
  });

  test("quantity +/- and remove work from the drawer", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    await addFirstProduct(page);

    const dialog = page.getByRole("dialog");
    const qty = dialog.locator('button[aria-label="Increase quantity"]').first().locator("xpath=preceding-sibling::span[1]");
    await dialog.locator('button[aria-label="Increase quantity"]').first().click();
    await expect(qty).toHaveText("2");
    await dialog.locator('button[aria-label="Decrease quantity"]').first().click();
    await expect(qty).toHaveText("1");

    await dialog.getByRole("button", { name: "Remove" }).first().click();
    await expect(dialog.getByText(/cart is empty/i)).toBeVisible();
  });

  test("close via X, backdrop, and Escape; body scroll is restored each time", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    // aria-hidden is correctly set once closed, which means getByRole("dialog") (a11y-tree-aware)
    // stops finding it — use a plain DOM locator to observe the attribute across both states.
    const dialog = page.locator('[role="dialog"]');

    await addFirstProduct(page);
    await page.locator('button[aria-label="Close cart"]').click();
    await expect(dialog).toHaveAttribute("aria-hidden", "true");
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");

    await addFirstProduct(page);
    await page.mouse.click(20, 20);
    await expect(dialog).toHaveAttribute("aria-hidden", "true");

    await addFirstProduct(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveAttribute("aria-hidden", "true");
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });

  test("header cart button opens the drawer without navigating; View Cart closes it and navigates to /cart", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    await addFirstProduct(page);
    await page.locator('button[aria-label="Close cart"]').click();

    await page.getByRole("link", { name: "Cart" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveURL(/\/shop/);

    await page.getByRole("dialog").getByRole("button", { name: "View Cart" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });

  test("focus moves into the drawer on open, is trapped while open, and returns to the trigger on close", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "Cart" }).click();
    await expect(page.locator('button[aria-label="Close cart"]')).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    const wrappedToLast = await page.evaluate(() => {
      const panel = document.querySelector('[role="dialog"]');
      return !!panel && panel.contains(document.activeElement);
    });
    expect(wrappedToLast).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("link", { name: "Cart" })).toBeFocused();
  });

  test("Buy Now does not open the drawer", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    await page.locator('a[href^="/product/"]:visible').first().click();
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Pay with" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    const drawerHidden = await page.evaluate(() => document.querySelector('[role="dialog"]')?.getAttribute("aria-hidden") !== "false");
    expect(drawerHidden).toBe(true);
  });
});

test.describe("Mobile (<700px): icon feedback, no drawer", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("Add to Cart never opens the drawer and never locks body scroll", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    await addFirstProduct(page);
    await page.waitForTimeout(200);

    const drawerHidden = await page.evaluate(() => document.querySelector('[role="dialog"]')?.getAttribute("aria-hidden") !== "false");
    expect(drawerHidden).toBe(true);
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noOverflow).toBe(true);
  });

  test('shows a "✓ Added" bubble near the cart icon that clears itself, and the badge count updates', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    await addFirstProduct(page);

    await expect(page.locator('span[role="status"]:has-text("Added")')).toBeVisible();
    await expect(page.locator('a[aria-label="Cart"] span.bg-sale')).toHaveText("1");

    await page.waitForTimeout(1700);
    await expect(page.locator('span[role="status"]:has-text("Added")')).toBeHidden();
  });

  test("navbar cart is a plain link to /cart", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Cart" }).click();
    await expect(page).toHaveURL(/\/cart$/);
  });

  test("Buy Now does not show the Added indicator", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/shop");
    await page.waitForLoadState("networkidle");
    // Shop.tsx renders both the desktop and mobile product grids in the DOM (one CSS-hidden per
    // breakpoint) — scope to the visible one, same as addFirstProduct's Add to Cart selector.
    await page.locator('a[href^="/product/"]:visible').first().click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Pay with" }).click();
    await page.waitForTimeout(200);
    await expect(page.locator('span[role="status"]:has-text("Added")')).toBeHidden();
  });
});
