import { describe, expect, it } from "vitest";
import { ADMIN_NAV, landingPath, matchNavLocation, roleCanAccess, tabsForRole } from "./adminAuth";
import type { AdminRole } from "../../context/AuthContext";

/** Every admin page URL that existed before the navigation was simplified (and still works), with the roles that could open it. */
const PAGE_ROLES: Record<string, AdminRole[]> = {
  "/admin": ["owner", "admin", "content", "merchandising", "support", "analytics"],
  "/admin/website/homepage": ["owner", "admin", "content"],
  "/admin/website/hero": ["owner", "admin", "content"],
  "/admin/website/announcement": ["owner", "admin", "content"],
  "/admin/website/trust-strip": ["owner", "admin", "content"],
  "/admin/website/blog": ["owner", "admin", "content"],
  "/admin/website/promotions": ["owner", "admin", "content"],
  "/admin/website/deals": ["owner", "admin", "content"],
  "/admin/website/navigation": ["owner", "admin", "content"],
  "/admin/website/footer": ["owner", "admin", "content"],
  "/admin/website/seo": ["owner", "admin", "content"],
  "/admin/media": ["owner", "admin", "content"],
  "/admin/merchandising/featured": ["owner", "admin", "merchandising"],
  "/admin/merchandising/trending": ["owner", "admin", "merchandising"],
  "/admin/merchandising/new-arrivals": ["owner", "admin", "merchandising"],
  "/admin/merchandising/categories": ["owner", "admin", "merchandising"],
  "/admin/products": ["owner", "admin", "merchandising"],
  "/admin/orders": ["owner", "admin", "support"],
  "/admin/payments": ["owner", "admin", "support"],
  "/admin/analytics": ["owner", "admin", "analytics"],
  "/admin/analytics/traffic": ["owner", "admin", "analytics"],
  "/admin/analytics/pages": ["owner", "admin", "analytics"],
  "/admin/analytics/products": ["owner", "admin", "analytics"],
  "/admin/analytics/carts": ["owner", "admin", "analytics", "support"],
  "/admin/analytics/conversion": ["owner", "admin", "analytics"],
  "/admin/analytics/search": ["owner", "admin", "analytics"],
  "/admin/analytics/recommendations": ["owner", "admin", "analytics"],
  "/admin/analytics/geography": ["owner", "admin", "analytics"],
  "/admin/analytics/acquisition": ["owner", "admin", "analytics"],
  "/admin/reviews": ["owner", "admin", "support"],
  "/admin/contact": ["owner", "admin", "support"],
  "/admin/system/integrations": ["owner", "admin"],
  "/admin/system/email": ["owner", "admin", "support"],
  "/admin/settings": ["owner", "admin", "content", "merchandising", "support", "analytics"],
  "/admin/settings/users": ["owner"],
  "/admin/settings/security": ["owner", "admin", "content", "merchandising", "support", "analytics"],
  "/admin/settings/activity": ["owner", "admin"],
};
const ROLES: AdminRole[] = ["owner", "admin", "content", "merchandising", "support", "analytics"];

describe("admin navigation", () => {
  it("keeps every page's role access exactly as before the simplification", () => {
    for (const [path, allowed] of Object.entries(PAGE_ROLES)) {
      for (const role of ROLES) expect(roleCanAccess(role, path), `${role} → ${path}`).toBe(allowed.includes(role));
    }
  });

  it("denies unknown or removed pages and a missing role", () => {
    expect(roleCanAccess("owner", "/admin/customers")).toBe(false);
    expect(roleCanAccess("owner", "/admin/odoo/status")).toBe(false);
    expect(roleCanAccess(null, "/admin")).toBe(false);
  });

  it("has far fewer sidebar entries than pages, with unique landing paths and no empty groups", () => {
    const items = ADMIN_NAV.flatMap((g) => g.items);
    expect(items.length).toBeLessThanOrEqual(14);
    expect(new Set(items.map((i) => i.path)).size).toBe(items.length);
    for (const g of ADMIN_NAV) expect(g.items.length).toBeGreaterThan(0);
    // every tab of every item is a registered page
    for (const i of items) for (const t of i.tabs ?? []) expect(PAGE_ROLES[t.path], t.path).toBeDefined();
  });

  it("maps URLs (including detail pages) to the right item and tab", () => {
    expect(matchNavLocation("/admin")?.item.label).toBe("Overview");
    expect(matchNavLocation("/admin/orders/abc-123")?.tab?.label).toBe("Orders");
    expect(matchNavLocation("/admin/orders/abc-123")?.item.label).toBe("Orders & payments");
    expect(matchNavLocation("/admin/website/homepage/hero")?.tab?.label).toBe("Sections");
    expect(matchNavLocation("/admin/settings/security")?.tab?.label).toBe("Security");
    expect(matchNavLocation("/admin/settings")?.tab?.label).toBe("Appearance");
    expect(matchNavLocation("/admin/analytics/geography")?.tab?.label).toBe("Geography");
    expect(matchNavLocation("/admin/analytics")?.tab?.label).toBe("Overview");
    expect(matchNavLocation("/admin/nope")).toBeUndefined();
  });

  it("shows each role only the tabs it may open, and lands it on the first one", () => {
    const system = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.label === "System health")!;
    expect(tabsForRole(system, "support").map((t) => t.label)).toEqual(["Email delivery"]);
    expect(landingPath(system, "support")).toBe("/admin/system/email");
    expect(landingPath(system, "owner")).toBe("/admin/system/integrations");
    const team = ADMIN_NAV.flatMap((g) => g.items).find((i) => i.label === "Team & security")!;
    expect(tabsForRole(team, "content").map((t) => t.label)).toEqual(["Security", "Appearance"]);
    expect(tabsForRole(team, "owner").map((t) => t.label)).toEqual(["Security", "Admin users", "Activity log", "Appearance"]);
  });
});
