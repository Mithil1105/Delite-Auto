import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { X, User } from "lucide-react";
import clsx from "clsx";
import { LanguageSwitcher } from "./LanguageSwitcher";

export interface MobileNavLink {
  to: string;
  label: string;
}

/**
 * The real sliding mobile nav drawer (replaces the old plain dropdown-strip under the header —
 * see Documentations MD/frontend-foundation-uiux-refactor.md). Header.tsx owns the `open` state
 * and the six CMS-driven nav links; this component owns the drawer's own behaviour: backdrop,
 * body-scroll lock, Escape-to-close, focus trap while open, and focus restored to the hamburger
 * button on close. Desktop mobile search stays a separate toggle in Header.tsx — not duplicated
 * in here. Wishlist lives in the always-visible mobile top bar now, not here — the drawer's
 * bottom row is Account + Language only (2026-10-07 header restructure, explicit instruction).
 */
export function MobileNavDrawer({
  open,
  onClose,
  navItems,
  currentPath,
  onNavigate,
  triggerRef,
  showAccountWishlist,
  accountHref,
  accountLabel,
}: {
  open: boolean;
  onClose: () => void;
  navItems: MobileNavLink[];
  currentPath: string;
  onNavigate: (to: string) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** Gates the Account link only. */
  showAccountWishlist: boolean;
  accountHref: string;
  accountLabel: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusable = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')) : [];
    focusable()[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const trigger = triggerRef.current;

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      (trigger ?? previouslyFocused)?.focus();
    };
  }, [open, onClose, triggerRef]);

  return (
    <div className={clsx("fixed inset-0 z-[60] lg:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={clsx(
          "absolute inset-0 bg-ink/50 transition-opacity duration-300 motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        ref={panelRef}
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? "Menu" : undefined}
        className={clsx(
          "absolute inset-y-0 left-0 w-[82%] max-w-[320px] bg-white shadow-lift flex flex-col",
          "transition-transform duration-300 ease-in-out motion-reduce:transition-none",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-line shrink-0">
          <Link to="/" onClick={() => onNavigate("/")} className="shrink-0">
            <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-brand-500 text-white font-display font-semibold uppercase tracking-tightish">
              Delite
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="grid place-items-center w-10 h-10 rounded-full hover:bg-steel-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => onNavigate(item.to)}
              className={clsx(
                "py-3.5 border-b border-line font-sans text-[15px] font-medium",
                currentPath === item.to ? "text-brand-700" : "text-ink"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="shrink-0 border-t border-line px-4 py-3 flex items-center gap-2">
          {showAccountWishlist && (
            <Link
              to={accountHref}
              onClick={() => onNavigate(accountHref)}
              className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-full border border-line text-[13px] font-semibold hover:bg-steel-50"
            >
              <User className="w-4 h-4" /> {accountLabel}
            </Link>
          )}
          <LanguageSwitcher dropUp className="flex-1" buttonClassName="w-full h-11 justify-center rounded-full border-line" />
        </div>
      </div>
    </div>
  );
}
