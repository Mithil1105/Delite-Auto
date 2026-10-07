import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu, ChevronDown, LogOut, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "../../context/AuthContext";
import { findNavItem } from "../services/adminAuth";
import { useOdooHealth } from "../hooks/useOdooHealth";

interface AdminTopBarProps {
  onOpenMobileMenu: () => void;
}

export function AdminTopBar({ onOpenMobileMenu }: AdminTopBarProps) {
  const location = useLocation();
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { health, loading } = useOdooHealth();
  const [accountOpen, setAccountOpen] = useState(false);

  const navItem = findNavItem(location.pathname);
  const title = navItem?.label ?? "Delite Admin";

  const odooOk = health?.reachable && (health.legacyRpcAuthenticated || health.json2Authenticated);

  const onSignOut = async () => {
    await signOut();
    navigate("/admin/login", { replace: true });
  };
  const onBack = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate("/admin");
  };

  return (
    <header className="h-16 border-b border-line bg-white flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-3 min-w-0">
        <button type="button" onClick={onOpenMobileMenu} className="lg:hidden p-1.5 -ml-1.5" aria-label="Open menu">
          <Menu className="w-5 h-5" />
        </button>
        <button type="button" onClick={onBack} className="grid place-items-center w-9 h-9 rounded-lg text-steel-600 hover:text-ink hover:bg-steel-100 transition-colors" aria-label="Go back" title="Go back">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-[15px] font-semibold truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div
          className={clsx(
            "hidden sm:flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1 rounded-full border",
            loading ? "border-line text-steel-500" : odooOk ? "border-badge-new/30 text-badge-new bg-badge-new/5" : "border-sale/30 text-sale bg-sale/5"
          )}
          title={health?.odooServerVersion ? `Odoo ${health.odooServerVersion}` : undefined}
        >
          <span className={clsx("w-1.5 h-1.5 rounded-full", loading ? "bg-steel-300" : odooOk ? "bg-badge-new" : "bg-sale")} />
          {loading ? "Checking…" : odooOk ? "Odoo Connected" : "Odoo Error"}
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setAccountOpen((v) => !v)}
            className="flex items-center gap-2 text-[13px] font-semibold hover:bg-steel-50 px-2.5 py-1.5 rounded-full"
          >
            <span className="w-7 h-7 rounded-full bg-brand-700 text-white grid place-items-center text-[11px] uppercase">
              {(profile?.full_name ?? user?.email ?? "?").charAt(0)}
            </span>
            <span className="hidden sm:inline">{profile?.full_name ?? user?.email}</span>
            <ChevronDown className="w-3.5 h-3.5 text-steel-500" />
          </button>
          {accountOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setAccountOpen(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white border border-line shadow-card z-20">
                <div className="px-3.5 py-3 border-b border-line">
                  <div className="text-[13px] font-semibold truncate">{profile?.full_name ?? "Admin"}</div>
                  <div className="text-[12px] text-steel-500 truncate">{user?.email}</div>
                  <div className="text-[11px] text-steel-500 mt-1 uppercase tracking-wide">{profile?.admin_role}</div>
                </div>
                <Link to="/" className="block px-3.5 py-2.5 text-[13px] hover:bg-steel-50">
                  View storefront ↗
                </Link>
                <button type="button" onClick={onSignOut} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-[13px] text-sale hover:bg-steel-50 text-left">
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
