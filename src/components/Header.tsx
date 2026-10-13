import { useEffect, useRef, useState } from "react";
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
import { HERO_WIDTH_CAP_CSS } from "../lib/layout/heroWidthCap";

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
  const headerRef = useRef<HTMLElement>(null);
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

  // Publishes the header's real rendered height as a CSS custom property so Hero.tsx's desktop
  // layout can size itself to exactly `100vh - this`, filling the rest of the screen with no gap
  // and nothing from the next section visible without scrolling (explicit instruction). A
  // ResizeObserver, not a one-time measurement, since the AnnouncementBar's content is CMS-driven
  // and can genuinely change the header's height after this first renders.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty("--header-height", `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Transparent-over-hero / white-on-scroll (explicit instruction, refined 2026-10-11): on the
  // homepage, the nav row (not the AnnouncementBar strip above it, which stays solid) is
  // transparent ONLY at the very top of the page — the instant any scrolling happens at all, even
  // 1px still well within the hero image, it switches to white. This is deliberately NOT "stays
  // transparent for as long as the hero is still visible" (an earlier version of this did that,
  // and was explicitly corrected: "even if the scrolling is through the hero image the background
  // will turn white"). So the check is just `window.scrollY === 0`, not hero geometry.
  //
  // Driven by a plain `scroll` event, not `IntersectionObserver` — a completely bare, vanilla
  // `IntersectionObserver` on this page was found (via direct JS injection in a real browser tab,
  // not assumed) to deliver ZERO callbacks, not even the spec-guaranteed initial one, which could
  // permanently stick `overHero` on `false`. A `scroll` listener has no such failure mode. Starts
  // `true` on the homepage so the first paint doesn't flash white before the first scroll check
  // runs.
  const [overHero, setOverHero] = useState(() => location.pathname === "/");
  useEffect(() => {
    if (location.pathname !== "/") {
      setOverHero(false);
      return;
    }
    const update = () => {
      setOverHero(window.scrollY === 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [location.pathname]);

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
    <header ref={headerRef} className="sticky top-0 z-50">
      <AnnouncementBar {...announcementContent} />

      <div
        className={clsx(
          "transition-colors duration-300",
          overHero ? "bg-transparent border-b border-transparent" : "bg-white border-b border-line"
        )}
      >
        {/* Logo sits on the left (UI/UX pass, branch `uiux`): [logo] [nav ……] [search · lang · account ·
            wishlist · cart]. Below lg the nav collapses into the hamburger drawer, which now lives with
            the right-hand icon cluster. 2026-10-11: real PNG logo supplied — swapped in for the
            placeholder pill, background-removed and cropped tight (see
            public/images/brand/delite-logo.png) so it reads cleanly on both the white nav and the
            transparent-over-hero state.
            `w-full px-5 sm:px-6 lg:px-8` (no `container-page` max-width) per explicit instruction —
            the nav fills the full browser width edge-to-edge instead of being capped/centered with
            empty margin on wide screens; every OTHER page keeps `.container-page`, unchanged.
            2026-10-13: `maxWidth: HERO_WIDTH_CAP_CSS` + `mx-auto` added on top of that — on a
            normal-to-large screen it's a no-op (100% is always the smaller side of the `min()`, so
            the nav still spans full width exactly as above), but on a genuinely ultra-wide monitor
            it caps and centers the nav to the SAME width Hero.tsx caps its own photo to, so the nav
            lines up with the crisp image instead of extending across its blurred side margins
            (explicit instruction, with a screenshot showing the nav spanning past the capped hero
            photo into the blur). Applied to every page, not just the homepage — Header has no
            per-page knowledge of whether a hero is present, and a consistent nav width across the
            site (only ever capped on screens wide enough to need it at all) is simpler and more
            predictable than conditioning this on the current route. */}
        <div className="w-full px-5 sm:px-6 lg:px-8 mx-auto flex items-center h-16 gap-3 lg:gap-8" style={{ maxWidth: HERO_WIDTH_CAP_CSS }}>
          <Link to="/" aria-label="Delite — home" className="shrink-0">
            <img src="/images/brand/delite-logo.png" alt="Delite" className="h-8 sm:h-9 w-auto" />
          </Link>

          <nav className="hidden lg:flex items-center gap-5 xl:gap-7">
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

          <div className="flex items-center gap-1 ml-auto">
            <form onSubmit={submitSearch} className="hidden lg:flex items-center w-56 xl:w-72 relative mr-1">
              <Search className="w-4 h-4 absolute left-3 text-steel-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder={t("header.searchPlaceholder")}
                className="w-full h-10 pl-9 pr-3 rounded-full border border-line bg-steel-50 text-[13px] focus:outline-none focus:border-brand-600"
              />
            </form>
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              aria-label={t("header.searchPlaceholder")}
              aria-pressed={mobileSearchOpen}
              className="lg:hidden grid place-items-center w-10 h-10 rounded-full hover:bg-steel-50"
            >
              <Search className="w-5 h-5" />
            </button>
            {/* Account + language: desktop (lg+) only — below lg both live at the bottom of the
                hamburger drawer instead (top bar stays to search/wishlist/cart + the hamburger). */}
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
