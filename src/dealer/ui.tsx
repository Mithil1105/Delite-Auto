import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { formatPaise } from "../../supabase/functions/_shared/dealer/pricing";
import { ApiError } from "./lib/transport";

export const money = formatPaise;

export const inputClass = "w-full h-10 px-3 border border-line bg-white text-[14px] rounded-md focus:outline-none focus:border-ink focus-visible:ring-2 focus-visible:ring-[var(--dealer-accent)]/30 transition-colors";
export const labelClass = "block text-[12px] font-medium uppercase tracking-wide mb-1.5 text-steel-500";
const btnBase = "inline-flex items-center justify-center gap-2 h-10 px-5 rounded-md text-[13.5px] font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dealer-accent)]/40";
export const btnPrimary = `${btnBase} text-white bg-[var(--dealer-accent)] hover:brightness-95 active:brightness-90`;
export const btnOutline = `${btnBase} border border-line bg-white text-ink hover:bg-steel-50`;
export const btnDanger = `${btnBase} border border-sale/40 text-sale bg-white hover:bg-sale/5`;

/** Loads data with explicit loading/error states and a reload handle. Never leaves the previous
 * result frozen on screen while the next one loads: `loading` flips true on every reload. */
export function useApi<T>(loader: () => Promise<T>, deps: unknown[]): { data: T | null; error: ApiError | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loaderRef.current().then(
      (res) => {
        if (cancelled) return;
        setData(res);
        setLoading(false);
      },
      (err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err : new ApiError("NETWORK", "Something went wrong — please try again."));
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse motion-reduce:animate-none bg-steel-100/70 rounded-md ${className}`} aria-hidden />;
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div role="alert" className="border border-sale/30 bg-sale/5 rounded-lg p-6 text-center">
      <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-sale" aria-hidden />
      <p className="text-[14px] font-medium mb-1">{error.message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 text-[13px] font-semibold underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border border-dashed border-line rounded-lg p-10 text-center bg-white">
      <Inbox className="w-7 h-7 mx-auto mb-3 text-steel-300" aria-hidden />
      <h2 className="text-[15px] font-semibold mb-1">{title}</h2>
      {children && <p className="text-[13.5px] text-steel-500 max-w-[48ch] mx-auto">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className = "w-4 h-4" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin motion-reduce:animate-none`} aria-hidden />;
}

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  pending_sync: { label: "Received", cls: "bg-amber-100 text-amber-800" },
  quotation: { label: "Awaiting confirmation", cls: "bg-sky-100 text-sky-800" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Completed", cls: "bg-steel-100 text-steel-700" },
  cancelled: { label: "Cancelled", cls: "bg-sale/10 text-sale" },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const s = ORDER_STATUS[status] ?? { label: status, cls: "bg-steel-100 text-steel-700" };
  return <span className={`inline-block text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ProductThumb({ url, name, className = "w-16 h-16" }: { url: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return <img src={url} alt={name} loading="lazy" onError={() => setFailed(true)} className={`${className} object-contain bg-white rounded-md border border-line`} />;
  }
  return (
    <div className={`${className} grid place-items-center rounded-md border border-line bg-gradient-to-br from-steel-50 to-steel-100 text-steel-500 font-display text-lg`} aria-hidden>
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}
