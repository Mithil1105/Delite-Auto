import { Link, useLocation } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../../context/AuthContext";
import { matchNavLocation, tabsForRole } from "../services/adminAuth";

/**
 * Tab bar for a sidebar item that groups several related pages (e.g. Homepage → Sections / Hero
 * banner / Promo banners). Rendered by AdminLayout above every page; shows nothing for single-page
 * items. Tabs are real links to each page's own URL, filtered to the signed-in role, so the browser's
 * back button, bookmarks and role checks work exactly as before.
 */
export function AdminTabs() {
  const { pathname } = useLocation();
  const { adminRole } = useAuth();
  const match = matchNavLocation(pathname);
  if (!match?.item.tabs) return null;
  const tabs = tabsForRole(match.item, adminRole);
  if (tabs.length < 2) return null;

  return (
    <nav aria-label={`${match.item.label} sections`} className="border-b border-line bg-white px-4 lg:px-8">
      <ul className="-mb-px flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {tabs.map((tab) => {
          const active = match.tab?.path === tab.path;
          return (
            <li key={tab.path} className="shrink-0">
              <Link
                to={tab.path}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "inline-flex h-11 items-center whitespace-nowrap border-b-2 px-3.5 text-[13.5px] font-medium transition-colors",
                  active ? "border-ink text-ink" : "border-transparent text-steel-500 hover:text-ink"
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
