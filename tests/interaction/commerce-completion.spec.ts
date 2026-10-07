import { test, expect } from "@playwright/test";

/**
 * Commerce completion phase (payments/email/auth-security/admin-users/wishlist/contact) — see
 * Documentations MD/delite-payments.md, delite-auth-security.md, delite-transactional-email.md.
 * Razorpay/Resend have no real provider secrets configured in this environment (test mode keys
 * were never provided) — those specific paths are covered by unit tests
 * (server/payments/razorpay.test.ts) and manual verification once real test-mode keys exist (see
 * the docs' "Test payment" section). These tests cover what's genuinely live here: real routes,
 * real Supabase Auth flows, the real (already-deployed, secret-free) contact-submit function, and
 * UI-level correctness that doesn't depend on a payment gateway actually being configured.
 */

test.describe("Checkout: payment method selector", () => {
  test("unauthenticated visitor is redirected to sign in first (RequireAuth, unchanged)", async ({ page }) => {
    await page.goto("/shop");
    await page.locator("button:has-text('Add to Cart'):visible").first().click();
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/login\?returnTo=/);
  });

  test("both methods are offered; COD shows the pay-on-delivery note, Online doesn't", async ({ page }) => {
    test.skip(!process.env.DELITE_TEST_CUSTOMER_EMAIL, "Requires a real bootstrapped customer account (DELITE_TEST_CUSTOMER_EMAIL/PASSWORD) — none provisioned in this environment.");
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.DELITE_TEST_CUSTOMER_EMAIL!);
    await page.getByLabel("Password").fill(process.env.DELITE_TEST_CUSTOMER_PASSWORD!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/account/);

    await page.goto("/shop");
    await page.locator("button:has-text('Add to Cart'):visible").first().click();
    await page.goto("/checkout");

    await expect(page.getByText("Payment Method")).toBeVisible();
    const online = page.getByText("Pay Online");
    const cod = page.getByText("Cash on Delivery");
    await expect(online).toBeVisible();
    await expect(cod).toBeVisible();

    // Online is the default selection — no COD note shown.
    await expect(page.getByText("Pay in cash when your order arrives.")).toHaveCount(0);

    await cod.click();
    await expect(page.getByText("Pay in cash when your order arrives.")).toBeVisible();
  });
});

test.describe("Forgot password", () => {
  test("always shows the same generic response, never revealing whether the email exists", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("definitely-not-a-real-account-xyz123@example.com");
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByText(/if an account exists for this email/i)).toBeVisible({ timeout: 10000 });
  });

  test("reachable from both the customer and admin login pages", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();

    await page.goto("/admin/login");
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
  });
});

test.describe("Reset password: invalid/missing link", () => {
  test("shows an invalid-link message rather than a password form when there's no recovery session", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel("New password")).toHaveCount(0);
  });
});

test.describe("Contact form: real submission", () => {
  test("submits to the real contact-submit function and shows a real success state", async ({ page }) => {
    await page.goto("/contact");
    const form = page.locator("form").filter({ has: page.getByPlaceholder(/full name/i) });
    await form.getByPlaceholder(/full name/i).fill("Playwright Test User");
    await form.locator('input[type="email"]').fill(`playwright-test-${Date.now()}@example.com`);
    await form.getByPlaceholder(/what do you need help with/i).fill("Automated test enquiry");
    await form.locator("textarea").fill("This is an automated Playwright test submission — safe to ignore/archive.");
    await form.getByRole("button", { name: /submit/i }).click();
    await expect(page.getByText(/message received/i)).toBeVisible({ timeout: 15000 });
  });

  test("honeypot field is present but positioned off-screen, invisible to a real visitor", async ({ page }) => {
    await page.goto("/contact");
    const honeypot = page.locator("#contact-website");
    await expect(honeypot).toBeAttached();
    const box = await honeypot.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeLessThan(0); // off-canvas (-9999px), not merely opacity/z-index tricks
    await expect(honeypot).toHaveAttribute("tabindex", "-1"); // never reachable via real keyboard Tab
  });
});

test.describe("Wishlist: guest still works exactly as before", () => {
  test("toggling the heart on a product card persists to localStorage without requiring sign-in", async ({ page }) => {
    await page.goto("/shop");
    const heart = page.locator("button[aria-label='Add to wishlist']").first();
    await heart.click();
    await expect(page.locator("button[aria-label='Remove from wishlist']").first()).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem("delite-auto-wishlist"));
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).length).toBeGreaterThan(0);
  });
});

test.describe("Admin: Security (MFA) page reachable, Admin Users gated", () => {
  test("unauthenticated visitor hitting /admin/settings/users or /admin/settings/security is redirected to admin login", async ({ page }) => {
    await page.goto("/admin/settings/users");
    await expect(page).toHaveURL(/\/admin\/login/);

    await page.goto("/admin/settings/security");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
