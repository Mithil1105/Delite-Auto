import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../i18n/LanguageContext";
import clsx from "clsx";

const NAV_ITEMS = [
  { to: "/account", label: "Overview", end: true },
  { to: "/account/orders", label: "My Orders" },
  { to: "/account/returns", label: "Returns & Exchanges" },
  { to: "/account/addresses", label: "Addresses" },
  { to: "/shop?wishlist=1", label: "Wishlist", external: true },
  { to: "/account/profile", label: "Profile" },
];

/**
 * The customer-facing account shell (spec #23) — separate from, and never linking into, Delite
 * Admin (spec #21: "Do not send customers into Admin"). Follows the existing storefront's own
 * design tokens (card-surface, container-page) rather than copying the Admin shell's look.
 */
export default function AccountLayout() {
  const { signOut } = useAuth();
  const { t } = useLang();

  return (
    <div className="container-page py-12">
      <div className="grid lg:grid-cols-[220px_1fr] gap-8">
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0">
          {NAV_ITEMS.map((item) =>
            item.external ? (
              <a key={item.to} href={item.to} className="whitespace-nowrap px-3 py-2.5 text-[13.5px] font-medium text-ink/80 hover:text-brand-700 hover:bg-steel-50 rounded-md">
                {item.label}
              </a>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    "whitespace-nowrap px-3 py-2.5 text-[13.5px] font-medium rounded-md",
                    isActive ? "bg-ink text-white" : "text-ink/80 hover:text-brand-700 hover:bg-steel-50"
                  )
                }
              >
                {item.label}
              </NavLink>
            )
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="whitespace-nowrap px-3 py-2.5 text-[13.5px] font-medium text-steel-500 hover:text-sale text-left mt-2 lg:mt-4 lg:border-t lg:border-line lg:pt-4"
          >
            {t("auth.signOut")}
          </button>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
