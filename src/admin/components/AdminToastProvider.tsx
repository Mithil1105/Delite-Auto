import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import clsx from "clsx";

interface ToastEntry {
  id: number;
  message: string;
  kind: "success" | "error";
}

interface AdminToastContextValue {
  showToast: (message: string, kind?: "success" | "error") => void;
}

const AdminToastContext = createContext<AdminToastContextValue | null>(null);

/**
 * One consistent admin toast system (spec: "Avoid browser alert()"). Deliberately simple — a
 * single queue slot is enough for this admin's action cadence (one save/publish at a time).
 */
export function AdminToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastEntry | null>(null);
  const idRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string, kind: "success" | "error" = "success") => {
    idRef.current += 1;
    setToast({ id: idRef.current, message, kind });
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  return (
    <AdminToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <div
          role="status"
          className={clsx(
            "fixed bottom-6 right-6 z-[100] flex items-center gap-2 px-4 py-3 text-[13.5px] font-semibold shadow-lift text-white",
            toast.kind === "success" ? "bg-ink" : "bg-sale"
          )}
        >
          {toast.kind === "success" ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </AdminToastContext.Provider>
  );
}

export function useAdminToast() {
  const ctx = useContext(AdminToastContext);
  if (!ctx) throw new Error("useAdminToast must be used within AdminToastProvider");
  return ctx;
}
