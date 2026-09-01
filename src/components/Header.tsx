import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Search, ShoppingCart, Menu, X, Phone, Heart } from "lucide-react";
import { Logo } from "./Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useCart } from "../context/CartContext";
import { useLang } from "../i18n/LanguageContext";
import { site } from "../data/site";
import clsx from "clsx";

export function Header() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { cartCount, wishlist } = useCart();
  const { t } = useLang();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname + location.search;

  const navItems = [
    { to: "/", label: t("nav.home") },
    { to: "/shop", label: t("nav.shop") },
    { to: "/shop?vehicle=car", label: t("nav.car") },
    { to: "/shop?vehicle=bike", label: t("nav.bike") },
    { to: "/brands", label: t("nav.brands") },
    { to: "/about", label: t("nav.about") },
    { to: "/contact", label: t("nav.contact") },
  ];

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(query.trim() ? `/shop?q=${encodeURIComponent(query.trim())}` : "/shop");
    setOpen(false);
  };

  return (
    <header className="sticky top-0 z-50">
      <div className="hidden sm:block bg-charcoal-deep text-white/70 text-[12px]">
        <div className="container-page flex items-center justify-between h-9">
          <span className="font-mono tracking-wide">{t("header.tagline")}</span>
          <a href={`tel:${site.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
            <Phone className="w-3 h-3" /> {site.phone}
          </a>
        </div>
      </div>

      <div className="bg-white/95 backdrop-blur border-b border-line">
        <div className="container-page flex items-center gap-4 h-16">
          <Link to="/" className="shrink-0 text-xl">
            <Logo />
          </Link>

          <nav className="hidden lg:flex items-center gap-6 ml-4">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={clsx(
                  "font-sans text-[13.5px] font-medium uppercase tracking-wide transition-colors whitespace-nowrap",
                  currentPath === item.to ? "text-accent" : "text-ink/80 hover:text-ink"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <form onSubmit={submitSearch} className="hidden md:flex items-center flex-1 max-w-sm ml-auto relative">
            <Search className="w-4 h-4 absolute left-3 text-steel-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder={t("header.searchPlaceholder")}
              className="w-full h-10 pl-9 pr-3 border border-line bg-steel-50 text-[13.5px] focus:outline-none focus:border-ink"
            />
          </form>

          <div className="flex items-center gap-1 ml-auto md:ml-3">
            <LanguageSwitcher />
            <Link to="/shop?wishlist=1" aria-label={t("header.wishlist")} className="relative hidden sm:grid place-items-center w-10 h-10 hover:bg-steel-50">
              <Heart className="w-5 h-5" />
              {wishlist.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 grid place-items-center bg-accent text-white text-[10px] font-semibold rounded-full">
                  {wishlist.length}
                </span>
              )}
            </Link>
            <Link to="/cart" aria-label={t("header.cart")} className="relative grid place-items-center w-10 h-10 hover:bg-steel-50">
              <ShoppingCart className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 grid place-items-center bg-accent text-white text-[10px] font-semibold rounded-full">
                  {cartCount}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              className="lg:hidden grid place-items-center w-10 h-10 hover:bg-steel-50"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="lg:hidden bg-white border-b border-line shadow-lift">
          <div className="container-page py-4 flex flex-col gap-1">
            <form onSubmit={submitSearch} className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-steel-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                placeholder={t("header.searchPlaceholderShort")}
                className="w-full h-11 pl-9 pr-3 border border-line bg-steel-50 text-[14px] focus:outline-none focus:border-ink"
              />
            </form>
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={clsx(
                  "py-3 border-b border-line font-sans text-[15px] font-medium uppercase",
                  currentPath === item.to ? "text-accent" : "text-ink"
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
