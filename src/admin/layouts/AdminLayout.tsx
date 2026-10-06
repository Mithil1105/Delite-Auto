import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AdminSidebar } from "../components/AdminSidebar";
import { AdminTopBar } from "../components/AdminTopBar";
import { AdminAppearanceProvider, useAdminAppearance } from "../appearance/AdminAppearance";

/**
 * Shell for every /admin/* route: sidebar + topbar + <Outlet/>. Matches the storefront's own
 * design tokens (bg-paper/card-surface/.btn-* from index.css) — no new visual language invented,
 * per Documentations MD/delite-admin.md.
 */
function AdminLayoutContent() {
  const { adminRole } = useAuth();
  const { appearance } = useAdminAppearance();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!adminRole) return <Outlet />; // RequireAdminRole already renders the denial state above this

  return (
    <div className={`admin-shell min-h-screen flex bg-paper ${appearance === "glass" ? "admin-glass" : "admin-legacy"}`}>
      <AdminSidebar role={adminRole} collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onToggleCollapsed={() => setCollapsed((v) => !v)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <AdminTopBar onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AdminLayout() { return <AdminAppearanceProvider><AdminLayoutContent /></AdminAppearanceProvider>; }
