import { useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, Menu, X, Heart, User } from "lucide-react";
import { track } from "../lib/analytics/client";
import clsx from "clsx";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AnnouncementBar } from "./AnnouncementBar";
import { MobileCartAddedIndicator } from "./cart/MobileCartAddedIndicator";
import { MobileNavDrawer } from "./MobileNavDrawer";
import { useCart, CART_DRAWER_BREAKPOINT } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useLang } from "../i18n/LanguageContext";
import { useSiteChromeCms } from "../hooks/useSiteChromeCms";
import type { AnnouncementContentOverride } from "./AnnouncementBar";

/** Stable analytics surface code for a header link — derived from the destination so it keeps
 * working when the links are edited in Delite Admin (Navigation). */
function navSurface(to: string): string {
  if (to.startsWith("/shop?vehicle=car")) return "nav_cars";
  if (to.startsWith("/shop?vehicle=bike")) return "nav_bikes";
  if (to === "/brands") return "nav_brands";
  if (to.includes("tag=bestseller")) return "nav_deals";
  if (to === "/about") return "nav_our_store";
  if (to === "/contact") return "nav_contact";
  return "nav_other";
}

export interface NavItemContent {
  label: string;
  url: string;
  visible: boolean;
}

export interface HeaderContentOverride {
  announcement?: AnnouncementContentOverride;
  navItems?: NavItemContent[];
}

export function Header({
  contentOverride,
  previewMobileMenuOpen,
}: { contentOverride?: HeaderContentOverride; previewMobileMenuOpen?: boolean } = {}) {
  const [openState, setOpenState] = useState(false);
  // Controlled only when the admin Navigation editor supplies previewMobileMenuOpen (its own
  // "Preview open menu" toggle, needed because PreviewFrame's click-interceptor otherwise
  // swallows the real hamburger button's click) — uncontrolled everywhere else, unchanged.
  const open = previewMobileMenuOpen ?? openState;
  const setOpen = setOpenState;
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { cartCount, wishlist, openCartDrawer, recentCartActivity } = useCart();
  const { session, configured: authConfigured } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname + location.search;
  // Tablet/desktop: cart button opens the drawer, stays on the page. Mobile: plain /cart link —
  // see Documentations MD/responsive-cart-drawer.md for why 700px, not Tailwind's `md` (768px).
  const isDrawerBreakpoint = useMediaQuery(CART_DRAWER_BREAKPOINT);

  // One query covers both the announcement bar and nav link overrides (site-chrome page) — see
  // Documentations MD/delite-admin.md, "Storefront CMS wiring". `contentOverride`, when supplied,
  // short-circuits both live fetches — used only by the admin Navigation editor's preview so it
  // can reflect unsaved keystrokes, never used storefront-side.
  const { bySectionKey: chrome } = useSiteChromeCms();
  const announcementContent =
    contentOverride?.announcement ?? (chrome.get("announcement-bar")?.content as AnnouncementContentOverride | undefined) ?? {};
  const publishedNavItems =
    contentOverride?.navItems ?? (chrome.get("navigation")?.content.items as NavItemContent[] | undefined) ?? [];

  // Note: none of these render an actual dropdown/mega-menu (a real Cars/Bikes/Shop-by-Brands
  // mega-menu is a deliberately deferred follow-up — see
  // Documentations MD/frontend-foundation-uiux-refactor.md) so no item shows a false
  // dropdown-affordance chevron.
  const defaultNavItems = [
    { to: "/shop?vehicle=car", label: t("nav.cars") },
    { to: "/shop?vehicle=bike", label: t("nav.bikes") },
    { to: "/brands", label: t("nav.shopByBrands") },
    { to: "/shop?tag=bestseller", label: t("nav.dealsOffers") },
    { to: "/about", label: t("nav.ourStore") },
    { to: "/contact", label: t("nav.contact") },
  ];
  const navItems =
    publishedNavItems.length > 0
      ? publishedNavItems.filter((i) => i.visible).map((i) => ({ to: i.url, label: i.label }))
      : defaultNavItems;

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // The search itself (query text, result count, clicks) is recorded by the Shop page once
    // results load; here we only note that the header search was used.
    track("navigation_click", { surface: "nav_search" });
    navigate(query.trim() ? `/shop?q=${encodeURIComponent(query.trim())}` : "/shop");
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-50">
      <AnnouncementBar {...announcementContent} />

      <div className="bg-white border-b border-line">
        {/* Logo is absolutely centered (true center regardless of how wide the left/right clusters
            are — flex `mx-auto` only centers when both siblings are equal width, which nav vs.
            icons never are) — see Documentations MD/frontend-foundation-uiux-refactor.md,
            "Header restructure". */}
        <div className="container-page relative flex items-center h-16">
          <div className="flex items-center gap-1 lg:gap-5">
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={open}
              className="lg:hidden grid place-items-center w-10 h-10 rounded-full hover:bg-steel-50"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              aria-label={t("header.searchPlaceholder")}
              aria-pressed={mobileSearchOpen}
              className="lg:hidden grid place-items-center w-10 h-10 rounded-full hover:bg-steel-50"
            >
              <Search className="w-5 h-5" />
            </button>

            <nav className="hidden lg:flex items-center gap-5">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => track("navigation_click", { surface: navSurface(item.to), metadata: { target: item.to } })}
                  className={clsx(
                    "inline-flex items-center gap-1 font-sans text-[12.5px] font-semibold uppercase tracking-wide transition-colors whitespace-nowrap",
                    currentPath === item.to ? "text-brand-700" : "text-ink/80 hover:text-brand-700"
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <Link to="/" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 shrink-0">
            <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-brand-500 text-white font-display font-semibold uppercase tracking-tightish">
              Delite
            </span>
          </Link>

          <div className="flex items-center gap-1 ml-auto">
            <form onSubmit={submitSearch} className="hidden lg:flex items-center w-64 xl:w-80 relative mr-1">
              <Search className="w-4 h-4 absolute left-3 text-steel-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder={t("header.searchPlaceholder")}
                className="w-full h-10 pl-9 pr-3 rounded-full border border-line bg-steel-50 text-[13px] focus:outline-none focus:border-brand-600"
              />
            </form>
            {/* Account + language: desktop (lg+) only — below lg both live at the bottom of the
                hamburger drawer instead, per explicit instruction (top bar stays to wishlist/cart
                + the hamburger/search pair on mobile). */}
            <div className="hidden lg:flex items-center">
              <LanguageSwitcher />
              {authConfigured && (
                <Link
                  to={session ? "/account" : "/login"}
                  aria-label={t("header.account")}
                  className="grid place-items-center w-10 h-10 rounded-full hover:bg-steel-50"
                >
                  <User className="w-5 h-5" />
                </Link>
              )}
            </div>
            <Link to="/shop?wishlist=1" aria-label={t("header.wishlist")} className="relative grid place-items-center w-10 h-10 rounded-full hover:bg-steel-50">
              <Heart className="w-5 h-5" />
              {wishlist.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 grid place-items-center bg-sale text-white text-[10px] font-semibold rounded-full">
                  {wishlist.length}
                </span>
              )}
            </Link>
            <Link
              to="/cart"
              onClick={(e) => {
                track("navigation_click", { surface: "nav_cart" });
                if (isDrawerBreakpoint) {
                  e.preventDefault();
                  openCartDrawer();
                }
              }}
              aria-label={t("header.cart")}
              className="relative grid place-items-center w-10 h-10 rounded-full hover:bg-steel-50"
            >
              <ShoppingCart
                key={!isDrawerBreakpoint ? recentCartActivity?.id : undefined}
                className={clsx("w-5 h-5", !isDrawerBreakpoint && "animate-cartBounce motion-reduce:animate-none")}
              />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 grid place-items-center bg-sale text-white text-[10px] font-semibold rounded-full">
                  {cartCount}
                </span>
              )}
              <MobileCartAddedIndicator />
            </Link>
          </div>
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="lg:hidden bg-white border-b border-line px-4 py-3">
          <form onSubmit={submitSearch} className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder={t("header.searchPlaceholderShort")}
              className="w-full h-11 pl-9 pr-3 rounded-full border border-line bg-steel-50 text-[14px] focus:outline-none focus:border-brand-600"
            />
          </form>
        </div>
      )}

      <MobileNavDrawer
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={menuTriggerRef}
        navItems={navItems}
        currentPath={currentPath}
        onNavigate={(to) => {
          track("navigation_click", { surface: navSurface(to), metadata: { target: to } });
          setOpen(false);
        }}
        showAccountWishlist={authConfigured}
        accountHref={session ? "/account" : "/login"}
        accountLabel={t("header.account")}
      />
    </header>
  );
}
