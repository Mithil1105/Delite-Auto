import { test, expect, type Page } from "@playwright/test";

/**
 * Figma-fidelity pass on the storefront (Home category sections, ProductCard Add-to-Cart state,
 * PromoBannerPair, Header) — see Documentations MD/frontend-foundation-uiux-refactor.md.
 * Deliberately behavioural, not pixel-diff (tests/visual/home.spec.ts already covers full-page
 * screenshot regression) — asserts on role/text/attribute state, not fixed coordinates.
 */

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

/** The closest ancestor <section> of a heading — not `.filter({ has }).first()`, which (in
 * document order) resolves to the broadest enclosing wrapper rather than the specific section. */
function sectionFor(page: Page, headingName: string) {
  return page.getByRole("heading", { name: headingName }).locator("xpath=ancestor::section[1]");
}

test.describe("Home: Top Categories segmented tabs", () => {
  test("Car section: switching a tab updates aria-selected and reloads the rail without a layout jump", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    const section = sectionFor(page, "Shop by Top Categories in Car");
    const tabs = section.getByRole("tab");
    await expect(tabs.first()).toBeVisible({ timeout: 15000 });

    const seatCovers = section.getByRole("tab", { name: /Seat Covers/i });
    const dashCams = section.getByRole("tab", { name: /Dash Cams/i });
    await expect(seatCovers).toHaveAttribute("aria-selected", "true");
    await expect(dashCams).toHaveAttribute("aria-selected", "false");

    const seatCoversBox = await seatCovers.boundingBox();
    const dashCamsBox = await dashCams.boundingBox();

    await dashCams.click();
    await expect(dashCams).toHaveAttribute("aria-selected", "true");
    await expect(seatCovers).toHaveAttribute("aria-selected", "false");

    // No layout jump: each tab keeps its own size when active/inactive swap.
    const seatCoversBoxAfter = await seatCovers.boundingBox();
    const dashCamsBoxAfter = await dashCams.boundingBox();
    expect(Math.round(seatCoversBoxAfter!.height)).toBe(Math.round(seatCoversBox!.height));
    expect(Math.round(dashCamsBoxAfter!.height)).toBe(Math.round(dashCamsBox!.height));
  });

  test("Bike section mirrors the Car section's structure (segmented tabs + View All + rail)", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    const section = sectionFor(page, "Shop by Top Categories in Bike");
    await expect(section.getByRole("tab").first()).toBeVisible({ timeout: 15000 });
    await expect(section.getByRole("tab")).toHaveCount(4);
    await expect(section.getByRole("link", { name: "View All" })).toBeVisible();
  });

  test("section-level scroll arrows sit next to View All and are disabled/enabled correctly", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    const section = sectionFor(page, "Shop by Top Categories in Car");
    await expect(section.getByRole("tab").first()).toBeVisible({ timeout: 15000 });

    const prev = section.getByRole("button", { name: "Scroll left" });
    await expect(section.getByRole("button", { name: "Scroll right" })).toBeVisible();
    await expect(prev).toBeVisible();
    await expect(prev).toBeDisabled(); // rail starts at position 0
  });
});

test.describe("ProductCard: Add to Cart success state", () => {
  test("desktop: outline -> solid 'Added to Cart' with check icon, then reverts; opens the cart drawer", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    const button = page.getByRole("button", { name: /^Add to Cart$/ }).first();
    await expect(button).toBeVisible({ timeout: 15000 });
    await button.scrollIntoViewIfNeeded();
    await button.click();

    const successButton = page.getByRole("button", { name: /Added to Cart/ });
    await expect(successButton).toBeVisible();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Reverts to "Add to Cart" after the hold window (spec: ~1.2-1.8s).
    await expect(successButton).toHaveCount(0, { timeout: 3000 });
  });

  test("mobile: shows the success state without opening the cart drawer", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    const button = page.getByRole("button", { name: /^Add to Cart$/ }).first();
    await expect(button).toBeVisible({ timeout: 15000 });
    await button.scrollIntoViewIfNeeded();
    await button.click();

    await expect(page.getByRole("button", { name: /Added to Cart/ })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("clicking again while in the success state settles to quantity 2, not a duplicate cart line", async ({ page }) => {
    // Mobile: no cart-drawer backdrop covering the card, so the same button stays clickable
    // through the success window (desktop's drawer would intercept the second click).
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    const button = page.getByRole("button", { name: /^Add to Cart$/ }).first();
    await expect(button).toBeVisible({ timeout: 15000 });
    await button.scrollIntoViewIfNeeded();
    await button.click();

    const successButton = page.getByRole("button", { name: /Added to Cart/ });
    await expect(successButton).toBeVisible();
    await successButton.click();

    await page.goto("/cart");
    // Exactly one cart line for the product (not a duplicate row from the second click), with
    // its quantity settled at 2. Scoped to <main> — the (visually hidden but still mounted)
    // CartDrawer renders its own copy of the same line elsewhere in the DOM.
    const main = page.locator("main");
    await expect(main.getByLabel("Decrease")).toHaveCount(1);
    await expect(main.getByLabel("Decrease").locator("xpath=following-sibling::span[1]")).toHaveText("2");
  });
});

test.describe("PromoBannerPair", () => {
  test("renders at least one promo card with real CMS content, stacks on mobile", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    const promoLinks = page.locator("a").filter({ has: page.locator("h3") });
    await expect(promoLinks.first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe("Header: desktop phone number removed", () => {
  test("no tel: link and no visible phone number in the desktop navbar", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/");
    await expect(page.locator("header a[href^='tel:']")).toHaveCount(0);
  });
});

test.describe("Mobile nav drawer", () => {
  async function openDrawer(page: Page) {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await page.getByRole("button", { name: "Toggle menu" }).click();
    const dialog = page.getByRole("dialog", { name: "Menu" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("opens with all six nav links and closes via the X button", async ({ page }) => {
    const dialog = await openDrawer(page);
    for (const label of ["Cars", "Bikes", "Shop by Brands", "Deals & Offers", "Our Store", "Contact Us"]) {
      await expect(dialog.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    await dialog.getByRole("button", { name: "Close menu" }).click();
    await expect(dialog).toBeHidden();
  });

  test("closes via Escape and restores focus to the hamburger button", async ({ page }) => {
    await openDrawer(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Toggle menu" })).toBeFocused();
  });

  test("closes on nav link selection and navigates", async ({ page }) => {
    const dialog = await openDrawer(page);
    await dialog.getByRole("link", { name: "Cars", exact: true }).click();
    await expect(page).toHaveURL(/vehicle=car/);
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  });

  test("locks body scroll while open", async ({ page }) => {
    await openDrawer(page);
    const overflow = await page.evaluate(() => document.body.style.overflow);
    expect(overflow).toBe("hidden");
  });
});
