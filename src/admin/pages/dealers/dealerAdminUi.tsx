import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import type { DealerStatus } from "./adminDealerApi";

/** Base path of the Dealers section inside the real admin shell. */
export const useAdminBase = (): string => "/admin";

/** The shared dealer UI (buttons etc.) reads its accent from a CSS variable; admin uses Delite navy. */
export const ADMIN_ACCENT_STYLE = { "--dealer-accent": "#10148F" } as CSSProperties;

const STATUS: Record<DealerStatus, string> = {
  draft: "bg-steel-100 text-steel-700",
  invited: "bg-sky-100 text-sky-800",
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-amber-100 text-amber-800",
  archived: "bg-steel-300/40 text-steel-700",
};

export function DealerStatusBadge({ status }: { status: DealerStatus }) {
  return <span className={`inline-block text-[11.5px] font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS[status]}`}>{status}</span>;
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" style={ADMIN_ACCENT_STYLE}>
      <div className="absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`relative bg-white rounded-lg shadow-lift w-full ${wide ? "max-w-5xl" : "max-w-lg"} max-h-[90vh] flex flex-col focus:outline-none`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="font-semibold text-[15px]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 -mr-1 text-steel-500 hover:text-ink"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateInput(value: string): string | null {
  return value ? new Date(`${value}T00:00:00`).toISOString() : null;
}

export const adminInput = "h-9 px-2.5 border border-line rounded-md bg-white text-[13px] focus:outline-none focus:border-ink";
