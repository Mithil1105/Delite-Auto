import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, Menu, X, Phone, Heart, User } from "lucide-react";
import clsx from "clsx";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileCartAddedIndicator } from "./cart/MobileCartAddedIndicator";
import { useCart, CART_DRAWER_BREAKPOINT } from "../context/CartContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useLang } from "../i18n/LanguageContext";
import { site } from "../data/site";

export function Header() {
  const [open, setOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { cartCount, wishlist, openCartDrawer, recentCartActivity } = useCart();
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname + location.search;
  // Tablet/desktop: cart button opens the drawer, stays on the page. Mobile: plain /cart link —
  // see Documentations MD/responsive-cart-drawer.md for why 700px, not Tailwind's `md` (768px).
  const isDrawerBreakpoint = useMediaQuery(CART_DRAWER_BREAKPOINT);

  // Note: none of these render an actual dropdown/mega-menu (a real Cars/Bikes/Shop-by-Brands
  // mega-menu is a deliberately deferred follow-up — see
  // Documentations MD/frontend-foundation-uiux-refactor.md) so no item shows a false
  // dropdown-affordance chevron.
  const navItems = [
    { to: "/shop?vehicle=car", label: t("nav.cars") },
    { to: "/shop?vehicle=bike", label: t("nav.bikes") },
    { to: "/brands", label: t("nav.shopByBrands") },
    { to: "/shop?tag=bestseller", label: t("nav.dealsOffers") },
    { to: "/about", label: t("nav.ourStore") },
    { to: "/contact", label: t("nav.contact") },
  ];

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(query.trim() ? `/shop?q=${encodeURIComponent(query.trim())}` : "/shop");
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-50">
      <div className="bg-brand-500 text-white text-[12px] text-center py-1.5 px-4">{t("header.announcement")}</div>

      <div className="bg-white border-b border-line">
        <div className="container-page flex items-center gap-4 h-16">
          <nav className="hidden lg:flex items-center gap-5">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={clsx(
                  "inline-flex items-center gap-1 font-sans text-[13.5px] font-medium transition-colors whitespace-nowrap",
                  currentPath === item.to ? "text-brand-700" : "text-ink/80 hover:text-brand-700"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link to="/" className="shrink-0 mx-auto lg:mx-0">
            <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-brand-500 text-white font-display font-semibold uppercase tracking-tightish">
              Delite
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-3 ml-auto">
            <a
              href={`tel:${site.phoneAlt.replace(/\s/g, "")}`}
              className="hidden xl:flex items-center gap-1.5 text-[12.5px] text-steel-700 hover:text-brand-700 shrink-0"
            >
              <Phone className="w-3.5 h-3.5" /> {site.phoneAlt}
            </a>

            <form onSubmit={submitSearch} className="flex items-center w-64 relative">
              <Search className="w-4 h-4 absolute left-3 text-steel-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder={t("header.searchPlaceholder")}
                className="w-full h-10 pl-9 pr-3 rounded-full border border-line bg-steel-50 text-[13px] focus:outline-none focus:border-brand-600"
              />
            </form>
          </div>

          <div className="flex items-center gap-1 ml-auto md:ml-2">
            <button
              type="button"
              onClick={() => setMobileSearchOpen((v) => !v)}
              aria-label={t("header.searchPlaceholder")}
              aria-pressed={mobileSearchOpen}
              className="md:hidden grid place-items-center w-10 h-10 rounded-full hover:bg-steel-50"
            >
              <Search className="w-5 h-5" />
            </button>
            <LanguageSwitcher />
            <button type="button" aria-label="Account" className="hidden sm:grid place-items-center w-10 h-10 rounded-full hover:bg-steel-50">
              <User className="w-5 h-5" />
            </button>
            <Link to="/shop?wishlist=1" aria-label={t("header.wishlist")} className="relative hidden sm:grid place-items-center w-10 h-10 rounded-full hover:bg-steel-50">
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
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              className="lg:hidden grid place-items-center w-10 h-10 rounded-full hover:bg-steel-50"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileSearchOpen && (
        <div className="md:hidden bg-white border-b border-line px-4 py-3">
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

      {open && (
        <div className="lg:hidden bg-white border-b border-line shadow-lift">
          <div className="container-page py-4 flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={clsx(
                  "py-3 border-b border-line font-sans text-[15px] font-medium",
                  currentPath === item.to ? "text-brand-700" : "text-ink"
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
