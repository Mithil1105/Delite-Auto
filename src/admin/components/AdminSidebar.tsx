import { NavLink } from "react-router-dom";
import { X, PanelLeftClose, PanelLeft } from "lucide-react";
import clsx from "clsx";
import { ADMIN_NAV } from "../services/adminAuth";
import type { AdminRole } from "../../context/AuthContext";

interface AdminSidebarProps {
  role: AdminRole;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleCollapsed: () => void;
}

export function AdminSidebar({ role, collapsed, mobileOpen, onCloseMobile, onToggleCollapsed }: AdminSidebarProps) {
  const groups = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={onCloseMobile} aria-hidden />}
      <aside
        className={clsx(
          "bg-charcoal-deep text-white flex flex-col shrink-0 transition-[width] duration-150 z-50",
          "fixed inset-y-0 left-0 lg:relative lg:inset-auto lg:min-h-screen lg:self-stretch",
          collapsed ? "lg:w-[68px]" : "lg:w-64",
          mobileOpen ? "translate-x-0 w-72" : "-translate-x-full lg:translate-x-0 w-72"
        )}
      >
        <div className="h-16 flex items-center justify-between gap-2 px-4 border-b border-white/10 shrink-0">
          <span className={clsx("font-display uppercase text-[15px] tracking-tightish truncate", collapsed && "lg:sr-only")}>Delite Admin</span>
          <button type="button" onClick={onToggleCollapsed} className="hidden lg:grid place-items-center w-9 h-9 -mr-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeft className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
          <button type="button" onClick={onCloseMobile} className="lg:hidden p-1 -mr-1" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="admin-sidebar-nav flex-1 min-h-0 overflow-y-auto lg:overflow-visible py-3" aria-label="Admin navigation">
          {groups.map((group) => (
            <div key={group.label} className="mb-4">
              {!collapsed && (
                <div className="px-4 mb-1 text-[10.5px] font-semibold uppercase tracking-widish text-white/40">{group.label}</div>
              )}
              {group.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 px-4 py-2 text-[13.5px] transition-colors",
                      isActive ? "bg-white/10 text-white font-semibold" : "text-white/70 hover:bg-white/5 hover:text-white"
                    )
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {!collapsed && (
                    <span className="flex-1 truncate flex items-center gap-2">
                      {item.label}
                      {item.status === "placeholder" && (
                        <span className="text-[9.5px] uppercase tracking-wide text-white/40 border border-white/20 rounded-full px-1.5 py-0.5 leading-none">
                          Soon
                        </span>
                      )}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
