import type { AdminRole } from "../../context/AuthContext";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Home,
  Megaphone,
  BadgePercent,
  Navigation,
  PanelBottom,
  Search,
  Image,
  Star,
  TrendingUp,
  Sparkles,
  LayoutGrid,
  Wand2,
  Package,
  Users,
  ShoppingCart,
  Footprints,
  FileText,
  Filter,
  MapPin,
  Share2,
  BarChart3,
  LineChart,
  MessageSquareText,
  Mail,
  Database,
  Settings,
  UserCog,
  ScrollText,
  ShieldCheck,
  Activity,
  MailWarning,
  CircleDollarSign,
} from "lucide-react";

/**
 * Single source of truth for the admin navigation: which route exists, which role(s) may reach
 * it, whether it's a real implemented page or a "coming soon" placeholder, and the icon/label the
 * sidebar renders. AdminSidebar.tsx and RequireAdminRole.tsx both read this — never duplicate a
 * role list in a second place. See Documentations MD/delite-admin.md, "Roles & permissions".
 */
export interface AdminNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: AdminRole[];
  /** "active" pages are fully wired this pass; "placeholder" pages render a clear
   * "Coming soon" state — never a fake-functional stub (spec section 61/Scope). */
  status: "active" | "placeholder";
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

const ALL_ROLES: AdminRole[] = ["owner", "admin", "content", "merchandising", "support", "analytics"];
const OWNER_ADMIN: AdminRole[] = ["owner", "admin"];
const OWNER_ADMIN_CONTENT: AdminRole[] = ["owner", "admin", "content"];
const OWNER_ADMIN_MERCH: AdminRole[] = ["owner", "admin", "merchandising"];
const OWNER_ADMIN_SUPPORT: AdminRole[] = ["owner", "admin", "support"];
const OWNER_ADMIN_ANALYTICS: AdminRole[] = ["owner", "admin", "analytics"];

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Overview", path: "/admin", icon: LayoutDashboard, roles: ALL_ROLES, status: "active" }],
  },
  {
    label: "Website",
    items: [
      { label: "Homepage", path: "/admin/website/homepage", icon: Home, roles: OWNER_ADMIN_CONTENT, status: "active" },
      { label: "Hero", path: "/admin/website/hero", icon: Megaphone, roles: OWNER_ADMIN_CONTENT, status: "active" },
      { label: "Announcement Bar", path: "/admin/website/announcement", icon: Megaphone, roles: OWNER_ADMIN_CONTENT, status: "active" },
      { label: "Promotions", path: "/admin/website/promotions", icon: BadgePercent, roles: OWNER_ADMIN_CONTENT, status: "active" },
      { label: "Navigation", path: "/admin/website/navigation", icon: Navigation, roles: OWNER_ADMIN_CONTENT, status: "active" },
      { label: "Footer", path: "/admin/website/footer", icon: PanelBottom, roles: OWNER_ADMIN_CONTENT, status: "active" },
      { label: "SEO", path: "/admin/website/seo", icon: Search, roles: OWNER_ADMIN_CONTENT, status: "active" },
    ],
  },
  {
    label: "Media",
    items: [{ label: "Marketing Media", path: "/admin/media", icon: Image, roles: OWNER_ADMIN_CONTENT, status: "active" }],
  },
  {
    label: "Merchandising",
    items: [
      { label: "Featured Products", path: "/admin/merchandising/featured", icon: Star, roles: OWNER_ADMIN_MERCH, status: "active" },
      { label: "Trending", path: "/admin/merchandising/trending", icon: TrendingUp, roles: OWNER_ADMIN_MERCH, status: "active" },
      { label: "New Arrivals", path: "/admin/merchandising/new-arrivals", icon: Sparkles, roles: OWNER_ADMIN_MERCH, status: "active" },
      { label: "Homepage Categories", path: "/admin/merchandising/categories", icon: LayoutGrid, roles: OWNER_ADMIN_MERCH, status: "active" },
      { label: "Recommendations", path: "/admin/merchandising/recommendations", icon: Wand2, roles: OWNER_ADMIN_MERCH, status: "placeholder" },
    ],
  },
  {
    label: "Commerce / Insights",
    items: [
      { label: "Products", path: "/admin/products", icon: Package, roles: [...OWNER_ADMIN, "merchandising"], status: "active" },
      // Not in the original spec's sidebar list — an existing, working real feature; kept and
      // placed here deliberately rather than removed. See Documentations MD/delite-admin.md.
      { label: "Orders", path: "/admin/orders", icon: ShoppingCart, roles: [...OWNER_ADMIN, "support"], status: "active" },
      { label: "Payments", path: "/admin/payments", icon: CircleDollarSign, roles: OWNER_ADMIN_SUPPORT, status: "active" },
      { label: "Customers", path: "/admin/customers", icon: Users, roles: OWNER_ADMIN_SUPPORT, status: "placeholder" },
    ],
  },
  {
    label: "Analytics",
    items: [
      { label: "Overview", path: "/admin/analytics", icon: BarChart3, roles: OWNER_ADMIN_ANALYTICS, status: "active" },
      { label: "Traffic", path: "/admin/analytics/traffic", icon: Footprints, roles: OWNER_ADMIN_ANALYTICS, status: "active" },
      { label: "Pages", path: "/admin/analytics/pages", icon: FileText, roles: OWNER_ADMIN_ANALYTICS, status: "active" },
      { label: "Products", path: "/admin/analytics/products", icon: LineChart, roles: OWNER_ADMIN_ANALYTICS, status: "active" },
      // Carts and session journeys are also useful to support (follow-up on abandoned carts).
      { label: "Carts", path: "/admin/analytics/carts", icon: ShoppingCart, roles: [...OWNER_ADMIN_ANALYTICS, "support"], status: "active" },
      { label: "Conversion", path: "/admin/analytics/conversion", icon: Filter, roles: OWNER_ADMIN_ANALYTICS, status: "active" },
      { label: "Search", path: "/admin/analytics/search", icon: Search, roles: OWNER_ADMIN_ANALYTICS, status: "active" },
      { label: "Recommendations", path: "/admin/analytics/recommendations", icon: Wand2, roles: OWNER_ADMIN_ANALYTICS, status: "active" },
      { label: "Geography", path: "/admin/analytics/geography", icon: MapPin, roles: OWNER_ADMIN_ANALYTICS, status: "active" },
      { label: "Acquisition", path: "/admin/analytics/acquisition", icon: Share2, roles: OWNER_ADMIN_ANALYTICS, status: "active" },
    ],
  },
  {
    label: "Customer Experience",
    items: [
      { label: "Reviews", path: "/admin/reviews", icon: MessageSquareText, roles: OWNER_ADMIN_SUPPORT, status: "active" },
      { label: "Contact Enquiries", path: "/admin/contact", icon: Mail, roles: OWNER_ADMIN_SUPPORT, status: "active" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Integrations Health", path: "/admin/system/integrations", icon: Activity, roles: OWNER_ADMIN, status: "active" },
      { label: "Email Delivery", path: "/admin/system/email", icon: MailWarning, roles: OWNER_ADMIN_SUPPORT, status: "active" },
      { label: "Odoo", path: "/admin/odoo/status", icon: Database, roles: OWNER_ADMIN, status: "active" },
      { label: "Admin Appearance", path: "/admin/settings", icon: Settings, roles: ALL_ROLES, status: "active" },
      { label: "Admin Users", path: "/admin/settings/users", icon: UserCog, roles: ["owner"], status: "active" },
      // ALL_ROLES, not OWNER_ADMIN — every admin role must be able to reach their own MFA
      // enrollment, or REQUIRE_ADMIN_MFA's route-guard AAL exception (RoleRoute already exempts
      // this one path from the AAL2 check) is unreachable for content/merchandising/support/
      // analytics accounts: the ROLE check ran first and denied them before the AAL check ever
      // applied, permanently locking them out the moment the policy is turned on. Found during the
      // 2026-09-30 security-hardening verification pass — see delite-auth-security.md.
      { label: "Security", path: "/admin/settings/security", icon: ShieldCheck, roles: ALL_ROLES, status: "active" },
      { label: "Activity Log", path: "/admin/settings/activity", icon: ScrollText, roles: OWNER_ADMIN, status: "active" },
    ],
  },
];

export function findNavItem(path: string): AdminNavItem | undefined {
  for (const group of ADMIN_NAV) {
    const item = group.items.find((i) => i.path === path);
    if (item) return item;
  }
  return undefined;
}

export function roleCanAccess(role: AdminRole | null, path: string): boolean {
  if (!role) return false;
  const item = findNavItem(path);
  if (!item) return false;
  return item.roles.includes(role);
}
