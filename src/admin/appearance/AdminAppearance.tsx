import { createContext, useContext, useState, type ReactNode } from "react";

export type AdminAppearance = "legacy" | "glass";
const KEY = "delite-admin-appearance";
const Context = createContext<{ appearance: AdminAppearance; setAppearance: (next: AdminAppearance) => void } | null>(null);
function initial(): AdminAppearance {
  try { return localStorage.getItem(KEY) === "legacy" ? "legacy" : "glass"; } catch { return "glass"; }
}
export function AdminAppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, set] = useState<AdminAppearance>(initial);
  const setAppearance = (next: AdminAppearance) => {
    set(next);
    try { localStorage.setItem(KEY, next); } catch { /* private browsing */ }
  };
  return <Context.Provider value={{ appearance, setAppearance }}>{children}</Context.Provider>;
}
export function useAdminAppearance() {
  const context = useContext(Context);
  if (!context) throw new Error("Admin appearance provider is missing");
  return context;
}
