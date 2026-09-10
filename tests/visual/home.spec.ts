import { test, expect } from "@playwright/test";

test("home page has no horizontal overflow and matches viewport screenshot", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(noOverflow).toBe(true);

  await expect(page).toHaveScreenshot(`home-${testInfo.project.name}.png`, { fullPage: true });
});
