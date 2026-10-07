import { useEffect, useRef, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, Info, Minus, TriangleAlert, X } from "lucide-react";
import clsx from "clsx";
import { change, fmtChange, type Change } from "./format";
import type { RpcState } from "./hooks";

/** Definition tooltip: keyboard-focusable and hover-revealed, so metrics are never ambiguous. */
export function InfoTip({ text, label = "Definition" }: { text: string; label?: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={`${label}: ${text}`} className="text-steel-300 hover:text-steel-700 focus:text-steel-700 focus:outline-none">
        <Info className="w-3.5 h-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1.5 w-64 hidden group-hover:block group-focus-within:block bg-ink text-white text-[11.5px] leading-snug font-normal normal-case tracking-normal p-2.5 shadow-lift"
      >
        {text}
      </span>
    </span>
  );
}

export function Panel({ title, subtitle, actions, children, className, help }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; help?: string }) {
  return (
    <section className={clsx("card-surface p-5 min-w-0", className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] uppercase tracking-wide flex items-center gap-1.5">
            {title}
            {help && <InfoTip text={help} />}
          </h2>
          {subtitle && <p className="text-[12px] text-steel-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Direction is shown with an arrow AND text (never colour alone). `goodWhenDown` for metrics like abandoned carts. */
export function ComparisonBadge({ current, previous, goodWhenDown = false, label }: { current: number | null | undefined; previous: number | null | undefined; goodWhenDown?: boolean; label?: string }) {
  const c: Change = change(current, previous);
  const good = c.kind === "up" ? !goodWhenDown : c.kind === "down" ? goodWhenDown : null;
  const Icon = c.kind === "up" ? ArrowUpRight : c.kind === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={clsx("inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums",
        good === true && "text-badge-new", good === false && "text-accent-700", good === null && "text-steel-500")}
      title={label}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {fmtChange(c)}
    </span>
  );
}

export function MetricCard({ label, value, help, current, previous, goodWhenDown, sub, compareLabel }: {
  label: string; value: ReactNode; help: string; current?: number | null; previous?: number | null; goodWhenDown?: boolean; sub?: ReactNode; compareLabel?: string;
}) {
  return (
    <div className="card-surface p-4 min-w-0" data-testid="metric-card">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-steel-500">
        <span className="truncate">{label}</span>
        <InfoTip text={help} />
      </div>
      <div className="font-display text-[26px] leading-tight mt-1.5 tabular-nums">{value}</div>
      <div className="mt-1.5 min-h-[18px] flex items-center gap-2 text-[11.5px] text-steel-500">
        {previous !== undefined && current !== undefined ? (
          <>
            <ComparisonBadge current={current} previous={previous} goodWhenDown={goodWhenDown} />
            <span className="truncate">{compareLabel ?? "vs previous"}</span>
          </>
        ) : (
          sub
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title = "No analytics collected yet", body = "Data appears here as soon as the storefront starts sending visits for this period.", icon = true }: { title?: string; body?: string; icon?: boolean }) {
  return (
    <div className="text-center py-10 px-4" data-testid="empty-state">
      {icon && <BarChart3 className="w-8 h-8 mx-auto text-steel-300" />}
      <p className="font-display uppercase text-[14px] mt-3">{title}</p>
      <p className="text-[12.5px] text-steel-500 mt-1 max-w-md mx-auto">{body}</p>
    </div>
  );
}

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5 py-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-4 bg-steel-50 animate-pulse" style={{ width: `${88 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 text-[13px] text-accent-700 bg-accent-50 border border-accent-100 p-3">
      <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

/** Renders loading / error / empty / content for an RPC result so every report handles all four states. */
export function Async<T>({ state, empty, children, rows }: { state: RpcState<T>; empty?: (data: T) => boolean; children: (data: T) => ReactNode; rows?: number }) {
  if (state.error) return <ErrorBlock message={state.error} />;
  if (state.loading || state.data === null) return <LoadingBlock rows={rows} />;
  if (empty?.(state.data)) return <EmptyState />;
  return <>{children(state.data)}</>;
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex border border-line bg-white">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx("px-3 py-1.5 text-[12px] font-semibold transition-colors", value === o.value ? "bg-ink text-white" : "text-steel-700 hover:bg-steel-50")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  return (
    <span
      className={clsx("inline-block text-[10.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5",
        tone === "neutral" && "bg-steel-50 text-steel-700", tone === "good" && "bg-emerald-50 text-badge-new",
        tone === "warn" && "bg-amber-50 text-amber-700", tone === "bad" && "bg-accent-50 text-accent-700", tone === "info" && "bg-brand-50 text-brand-500")}
    >
      {children}
    </span>
  );
}

/**
 * Right-hand slide-over for details (page, product, cart, session, query, payment, review…) — one
 * shared component behind every admin detail drawer. Esc / overlay click closes; while open, Tab
 * is trapped inside the panel and focus returns to whatever triggered it on close (previously
 * neither existed — a real keyboard-accessibility gap found and fixed in the 2026-09-30
 * security/operations verification pass, see Documentations MD/delite-production-operations.md —
 * same trap/restore pattern already established in MobileNavDrawer.tsx).
 */
export function Drawer({ open, onClose, title, subtitle, children }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = panel.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90]" data-testid="drawer">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden />
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"}
        className="absolute right-0 top-0 h-full w-[min(640px,100vw)] bg-paper shadow-lift overflow-y-auto focus:outline-none">
        <div className="sticky top-0 z-10 bg-white border-b border-line px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[17px] uppercase tracking-wide truncate">{title}</h2>
            {subtitle && <p className="text-[12px] text-steel-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close details" className="text-steel-500 hover:text-ink p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-5">{children}</div>
      </div>
    </div>
  );
}

export function KeyValue({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1.5 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-steel-500">{k}</dt>
          <dd className="font-medium min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
