import { test, expect, type Page } from "@playwright/test";

/**
 * Admin role/MFA security-hardening verification pass (Documentations MD/delite-auth-security.md,
 * "2026-09-30 security-hardening verification"). Two describe blocks:
 *
 * 1. Support-role access — requires a real, pre-provisioned `admin_role = 'support'` test account
 *    (this session used `delite-support-test@gmail.com`, reset via `admin-bootstrap` and promoted
 *    via a direct `profiles.admin_role` update — never the real owner account). Credentials come
 *    from the environment only (SUPPORT_TEST_EMAIL/SUPPORT_TEST_PASSWORD), never hardcoded — see
 *    the credential-exposure fix in admin-panel.spec.ts's history for why that matters here.
 * 2. MFA policy frontend enforcement — mocks the `admin-security-policy` response instead of
 *    toggling the real, global `private.app_config.require_admin_mfa` flag, which would affect
 *    every real admin session in production for the duration of the test. This verifies the exact
 *    client-side logic (`AuthContext`/`RoleRoute`) without any live blast radius. The equivalent
 *    server-side enforcement (`_shared/auth/requireAdmin.ts`, `private.admin_mfa_satisfied()` RLS)
 *    was verified by direct code/SQL audit in this pass, not by a live toggle — see
 *    delite-auth-security.md's Known issues for why a live end-to-end AAL1-rejection test still
 *    needs a deliberate, explicitly-confirmed maintenance-window run.
 */

const SUPPORT_EMAIL = process.env.SUPPORT_TEST_EMAIL;
const SUPPORT_PASSWORD = process.env.SUPPORT_TEST_PASSWORD;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/admin/login");
  await page.locator("#admin-login-email").fill(email);
  await page.locator("#admin-login-password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/admin$/, { timeout: 15000 });
}

async function sessionAccessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
    const raw = key ? localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw)?.access_token as string | undefined) ?? null : null;
  });
  if (!token) throw new Error("no session token in localStorage after sign-in");
  return token;
}

test.describe("Support role: sidebar, routes, and backend authorization agree", () => {
  test.skip(!SUPPORT_EMAIL || !SUPPORT_PASSWORD, "Requires SUPPORT_TEST_EMAIL/SUPPORT_TEST_PASSWORD (a real admin_role='support' account)");
  test.describe.configure({ mode: "serial" });
  // One sign-in for the whole block (Supabase Auth rate-limits repeated password sign-ins) —
  // real, deliberate coupling, not a stylistic choice.

  test("sidebar + route + backend authorization all agree for the support role", async ({ page }) => {
    await signIn(page, SUPPORT_EMAIL!, SUPPORT_PASSWORD!);

    for (const label of ["Overview", "Orders", "Payments", "Reviews", "Contact Enquiries", "Email Delivery", "Security"]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    for (const label of ["Admin Users", "Homepage", "Featured Products", "Integrations Health"]) {
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0);
    }

    for (const path of ["/admin/orders", "/admin/payments", "/admin/reviews", "/admin/contact", "/admin/settings/security"]) {
      await page.goto(path);
      await page.waitForTimeout(500);
      await expect(page.getByText("Access denied")).toHaveCount(0);
    }

    await page.goto("/admin/settings/users");
    await expect(page.getByText("Access denied")).toBeVisible();

    const token = await sessionAccessToken(page);
    // Non-secret (browser-shipped) config, same values as .env.local's VITE_SUPABASE_URL/
    // VITE_SUPABASE_PUBLISHABLE_KEY — hardcoded here rather than read from process.env, since a
    // Playwright test process doesn't see Vite's .env.local (that's loaded by the dev server for
    // the browser, not this Node process). The anon/publishable key is safe by design; see
    // .env.local's own comment.
    const url = "https://zafjmlwbolgdattfdgch.supabase.co";
    const key = "sb_publishable_ZPhMsj74L1iq9z0jihUSeA_p2f-Mmp3";

    const usersRes = await page.request.post(`${url}/functions/v1/admin-users-manage`, {
      headers: { Authorization: `Bearer ${token}`, apikey: key, "Content-Type": "application/json" },
      data: { action: "list" },
    });
    expect(usersRes.status()).toBe(403);

    const paymentsRes = await page.request.post(`${url}/rest/v1/rpc/admin_payments_list`, {
      headers: { Authorization: `Bearer ${token}`, apikey: key, "Content-Type": "application/json" },
      data: { p_limit: 1, p_offset: 0 },
    });
    expect(paymentsRes.status()).toBe(200);
  });
});

test.describe("MFA policy — frontend enforcement (mocked, never touches the live global flag)", () => {
  test.skip(!SUPPORT_EMAIL || !SUPPORT_PASSWORD, "Requires SUPPORT_TEST_EMAIL/SUPPORT_TEST_PASSWORD");
  test.describe.configure({ mode: "serial" });

  test("Security page stays reachable at AAL1, every other page is blocked, once the policy is forced on", async ({ page }) => {
    // Intercept only the policy read — the account's real session is genuinely AAL1 (no factor
    // enrolled on the test account), so this exercises the real "AAL1 + policy on" branch of
    // RoleRoute without ever writing to the live, global private.app_config table.
    await page.route("**/functions/v1/admin-security-policy", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ requireAdminMfa: true }) })
    );
    await signIn(page, SUPPORT_EMAIL!, SUPPORT_PASSWORD!);

    await page.goto("/admin/settings/security");
    await page.waitForTimeout(600);
    await expect(page.getByText("Two-factor authentication required")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /set up two-factor authentication/i })).toBeVisible();

    await page.goto("/admin/orders");
    await page.waitForTimeout(600);
    await expect(page.getByText("Two-factor authentication required")).toBeVisible();
    await expect(page.getByRole("link", { name: /go to security/i })).toBeVisible();
  });
});
