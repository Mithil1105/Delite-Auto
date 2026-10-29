import type { AdminRole } from "../../context/AuthContext";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Home,
  Tag,
  PanelBottom,
  Search,
  Newspaper,
  Image,
  Star,
  Package,
  ShoppingCart,
  BarChart3,
  MessageSquareText,
  ShieldCheck,
  Activity,
  Building2,
} from "lucide-react";

/**
 * Single source of truth for the admin navigation: which route exists, which role(s) may reach
 * it, and the icon/label the sidebar renders. AdminSidebar.tsx, AdminTabs.tsx, AdminTopBar.tsx and
 * RequireAdminRole.tsx all read this — never duplicate a role list in a second place. See
 * Documentations MD/delite-admin.md ("Roles & permissions") and
 * Documentations MD/admin-navigation-simplification.md.
 *
 * One sidebar item per job. An item that groups several related pages carries `tabs`: the sidebar
 * shows a single entry and AdminLayout renders the tab bar above the page. Every tab keeps its own
 * URL and its own role list, so deep links, bookmarks and role checks are unchanged.
 */
export interface AdminNavTab {
  label: string;
  path: string;
  roles: AdminRole[];
}

export interface AdminNavItem {
  label: string;
  /** Landing page. For a tabbed item this is the first tab. */
  path: string;
  icon: LucideIcon;
  /** Roles that can reach the item (for a tabbed item: the union of its tabs' roles). */
  roles: AdminRole[];
  tabs?: AdminNavTab[];
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

const ALL_ROLES: AdminRole[] = ["owner", "admin", "content", "merchandising", "support", "analytics", "dealer_manager"];
const OWNER: AdminRole[] = ["owner"];
const OWNER_ADMIN: AdminRole[] = ["owner", "admin"];
const OWNER_ADMIN_CONTENT: AdminRole[] = ["owner", "admin", "content"];
const OWNER_ADMIN_MERCH: AdminRole[] = ["owner", "admin", "merchandising"];
const OWNER_ADMIN_SUPPORT: AdminRole[] = ["owner", "admin", "support"];
const DEALER_ADMINS: AdminRole[] = ["owner", "admin", "support", "dealer_manager"];
const OWNER_ADMIN_ANALYTICS: AdminRole[] = ["owner", "admin", "analytics"];

const union = (tabs: AdminNavTab[]): AdminRole[] => ALL_ROLES.filter((r) => tabs.some((t) => t.roles.includes(r)));

function tabbed(label: string, icon: LucideIcon, tabs: AdminNavTab[]): AdminNavItem {
  return { label, icon, path: tabs[0].path, roles: union(tabs), tabs };
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Overview", path: "/admin", icon: LayoutDashboard, roles: ALL_ROLES }],
  },
  {
    label: "Website",
    items: [
      tabbed("Homepage", Home, [
        { label: "Sections", path: "/admin/website/homepage", roles: OWNER_ADMIN_CONTENT },
        { label: "Hero banner", path: "/admin/website/hero", roles: OWNER_ADMIN_CONTENT },
        { label: "Promo banners", path: "/admin/website/promotions", roles: OWNER_ADMIN_CONTENT },
      ]),
      { label: "Deals & Offers", path: "/admin/website/deals", icon: Tag, roles: OWNER_ADMIN_CONTENT },
      tabbed("Header & footer", PanelBottom, [
        { label: "Announcement bar", path: "/admin/website/announcement", roles: OWNER_ADMIN_CONTENT },
        { label: "Product strip", path: "/admin/website/trust-strip", roles: OWNER_ADMIN_CONTENT },
        { label: "Menu", path: "/admin/website/navigation", roles: OWNER_ADMIN_CONTENT },
        { label: "Footer", path: "/admin/website/footer", roles: OWNER_ADMIN_CONTENT },
      ]),
      { label: "Blog", path: "/admin/website/blog", icon: Newspaper, roles: OWNER_ADMIN_CONTENT },
      { label: "SEO", path: "/admin/website/seo", icon: Search, roles: OWNER_ADMIN_CONTENT },
      { label: "Media library", path: "/admin/media", icon: Image, roles: OWNER_ADMIN_CONTENT },
    ],
  },
  {
    label: "Catalog",
    items: [
      tabbed("Product lists", Star, [
        { label: "Featured", path: "/admin/merchandising/featured", roles: OWNER_ADMIN_MERCH },
        { label: "Trending", path: "/admin/merchandising/trending", roles: OWNER_ADMIN_MERCH },
        { label: "New arrivals", path: "/admin/merchandising/new-arrivals", roles: OWNER_ADMIN_MERCH },
        { label: "Homepage categories", path: "/admin/merchandising/categories", roles: OWNER_ADMIN_MERCH },
      ]),
      // Read-only view of the Odoo catalog (edit products in Odoo itself).
      { label: "Products", path: "/admin/products", icon: Package, roles: [...OWNER_ADMIN, "merchandising"] },
    ],
  },
  {
    label: "Sales",
    items: [
      tabbed("Orders & payments", ShoppingCart, [
        { label: "Orders", path: "/admin/orders", roles: OWNER_ADMIN_SUPPORT },
        { label: "Payments", path: "/admin/payments", roles: OWNER_ADMIN_SUPPORT },
      ]),
      // B2B dealer portal admin (see Documentations MD/dealer-portal.md). Support can VIEW dealers and
      // orders; every write (and all pricing) is further restricted server-side to owner/admin by the
      // admin-dealers function's capability table — this list is only the UX gate.
      tabbed("Dealers", Building2, [
        { label: "Dealers", path: "/admin/dealers", roles: DEALER_ADMINS },
        { label: "Dealer orders", path: "/admin/dealer-orders", roles: DEALER_ADMINS },
      ]),
    ],
  },
  {
    label: "Customers",
    items: [
      tabbed("Reviews & messages", MessageSquareText, [
        { label: "Reviews", path: "/admin/reviews", roles: OWNER_ADMIN_SUPPORT },
        { label: "Contact enquiries", path: "/admin/contact", roles: OWNER_ADMIN_SUPPORT },
      ]),
    ],
  },
  {
    label: "Analytics",
    items: [
      tabbed("Analytics", BarChart3, [
        { label: "Overview", path: "/admin/analytics", roles: OWNER_ADMIN_ANALYTICS },
        { label: "Traffic", path: "/admin/analytics/traffic", roles: OWNER_ADMIN_ANALYTICS },
        { label: "Pages", path: "/admin/analytics/pages", roles: OWNER_ADMIN_ANALYTICS },
        { label: "Products", path: "/admin/analytics/products", roles: OWNER_ADMIN_ANALYTICS },
        // Carts and session journeys are also useful to support (follow-up on abandoned carts).
        { label: "Carts", path: "/admin/analytics/carts", roles: [...OWNER_ADMIN_ANALYTICS, "support"] },
        { label: "Conversion", path: "/admin/analytics/conversion", roles: OWNER_ADMIN_ANALYTICS },
        { label: "Search", path: "/admin/analytics/search", roles: OWNER_ADMIN_ANALYTICS },
        { label: "Recommendations", path: "/admin/analytics/recommendations", roles: OWNER_ADMIN_ANALYTICS },
        { label: "Geography", path: "/admin/analytics/geography", roles: OWNER_ADMIN_ANALYTICS },
        { label: "Acquisition", path: "/admin/analytics/acquisition", roles: OWNER_ADMIN_ANALYTICS },
      ]),
    ],
  },
  {
    label: "Settings",
    items: [
      // The Odoo connection status lives in "Integrations" (and the top bar's Odoo chip) — the old
      // standalone Odoo page only repeated it.
      tabbed("System health", Activity, [
        { label: "Integrations", path: "/admin/system/integrations", roles: OWNER_ADMIN },
        { label: "Email delivery", path: "/admin/system/email", roles: OWNER_ADMIN_SUPPORT },
      ]),
      tabbed("Team & security", ShieldCheck, [
        // Security is open to ALL_ROLES, not OWNER_ADMIN — every admin role must be able to reach
        // their own MFA enrollment, or REQUIRE_ADMIN_MFA's route-guard AAL exception (RoleRoute
        // already exempts this one path from the AAL2 check) is unreachable for content/
        // merchandising/support/analytics accounts: the ROLE check ran first and denied them
        // before the AAL check ever applied, permanently locking them out the moment the policy
        // is turned on. Found during the 2026-09-30 security-hardening verification pass — see
        // delite-auth-security.md. It is the first tab so it is every role's landing page here.
        { label: "Security", path: "/admin/settings/security", roles: ALL_ROLES },
        { label: "Admin users", path: "/admin/settings/users", roles: OWNER },
        { label: "Activity log", path: "/admin/settings/activity", roles: OWNER_ADMIN },
        { label: "Appearance", path: "/admin/settings", roles: ALL_ROLES },
      ]),
    ],
  },
];

export interface NavMatch {
  item: AdminNavItem;
  tab?: AdminNavTab;
}

/** Every (item, tab?) pair with the path it answers to. */
function allEntries(): { path: string; match: NavMatch }[] {
  const out: { path: string; match: NavMatch }[] = [];
  for (const group of ADMIN_NAV) {
    for (const item of group.items) {
      if (item.tabs) for (const tab of item.tabs) out.push({ path: tab.path, match: { item, tab } });
      else out.push({ path: item.path, match: { item } });
    }
  }
  return out;
}

/** Exact lookup — a route a page registers with RoleRoute. */
export function matchNavPath(path: string): NavMatch | undefined {
  return allEntries().find((e) => e.path === path)?.match;
}

/**
 * Which nav entry the current URL belongs to: an exact match, otherwise the longest registered path
 * that is a parent of it (so /admin/orders/123 → Orders, /admin/website/homepage/hero → Sections).
 * "/admin" itself only ever matches exactly.
 */
export function matchNavLocation(pathname: string): NavMatch | undefined {
  const clean = pathname.replace(/\/+$/, "") || "/";
  let best: { path: string; match: NavMatch } | undefined;
  for (const e of allEntries()) {
    const hit = clean === e.path || (e.path !== "/admin" && clean.startsWith(e.path + "/"));
    if (hit && (!best || e.path.length > best.path.length)) best = e;
  }
  return best?.match;
}

export function findNavItem(path: string): AdminNavItem | undefined {
  return matchNavPath(path)?.item;
}

/** Tabs of `item` this role may open. */
export function tabsForRole(item: AdminNavItem, role: AdminRole | null): AdminNavTab[] {
  return role && item.tabs ? item.tabs.filter((t) => t.roles.includes(role)) : [];
}

/** Where the sidebar link for `item` should go for this role (its first tab the role may open). */
export function landingPath(item: AdminNavItem, role: AdminRole | null): string {
  return tabsForRole(item, role)[0]?.path ?? item.path;
}

export function roleCanAccess(role: AdminRole | null, path: string): boolean {
  if (!role) return false;
  const match = matchNavPath(path);
  if (!match) return false;
  return (match.tab ?? match.item).roles.includes(role);
}
