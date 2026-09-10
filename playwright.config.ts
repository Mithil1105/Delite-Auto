import { defineConfig } from "@playwright/test";

/**
 * Visual regression baseline — see Documentations MD/frontend-foundation-uiux-refactor.md.
 * Interaction tests (cart drawer etc.) — see Documentations MD/responsive-cart-drawer.md.
 * No CI pipeline exists yet; baselines/screenshots are captured/reviewed locally (Windows-rendered).
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:5173",
  },
  projects: [
    { name: "desktop-1440", testMatch: /visual\//, use: { viewport: { width: 1440, height: 900 } } },
    { name: "mobile-390", testMatch: /visual\//, use: { viewport: { width: 390, height: 844 } } },
    { name: "desktop-1280", testMatch: /visual\//, use: { viewport: { width: 1280, height: 800 } } },
    { name: "desktop-1920", testMatch: /visual\//, use: { viewport: { width: 1920, height: 1080 } } },
    // Interaction specs set their own viewport per test (mobile/tablet/desktop breakpoints all
    // covered within one run) rather than needing a project per breakpoint.
    { name: "interaction", testMatch: /interaction\//, use: { viewport: { width: 1440, height: 900 } } },
  ],
});
