import { test, expect } from "@playwright/test";

/**
 * Real accounts/checkout/admin gating (see Documentations MD/delite-accounts-orders-reviews-admin.md).
 * Doesn't require a confirmed test account — only exercises the route guards
 * (RequireAuth/RequireAdmin) and that the new pages render, which is genuinely testable without
 * signing in. Full signed-in flows (review submission, real order placement, admin moderation)
 * need a confirmed Supabase Auth session and are documented as manually verified instead — see
 * that doc's "Known gaps".
 */
test.describe("Auth gating", () => {
  test("an unauthenticated visitor to /checkout is redirected to /login with a returnTo", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fcheckout/);
  });

  test("an unauthenticated visitor to /account is redirected to /login", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);
  });

  test("an unauthenticated visitor to /admin is redirected to /login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the login page renders a real sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("the signup page renders a real sign-up form", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test("the header account link points to /login when signed out", async ({ page }) => {
    await page.goto("/");
    const accountLink = page.getByRole("link", { name: /account/i });
    await expect(accountLink).toHaveAttribute("href", "/login");
  });
});
