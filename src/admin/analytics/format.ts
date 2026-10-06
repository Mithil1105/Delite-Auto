/** Presentation helpers for analytics. Pure; unit-tested. */

export const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const NUM = new Intl.NumberFormat("en-IN");

export function fmtNumber(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : NUM.format(n);
}
export function fmtMoney(n: number | null | undefined): string {
  return n === null || n === undefined || Number.isNaN(n) ? "—" : INR.format(n);
}
export function fmtPercent(numerator: number, denominator: number, digits = 1): string {
  if (!denominator) return "—";
  const v = (numerator / denominator) * 100;
  return `${v.toFixed(v > 0 && v < 1 ? 2 : digits)}%`;
}
export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** 45 -> "45s", 192 -> "3m 12s", 3900 -> "1h 05m". */
export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

/** "5 min ago", "3 h ago", "2 d ago". */
export function fmtSince(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} d ago`;
}

export type Change =
  | { kind: "up" | "down"; pct: number }
  | { kind: "flat" }
  | { kind: "new" }          // no comparison-period value: never shown as Infinity%
  | { kind: "none" };        // nothing in either period

/**
 * Period-over-period change. A comparison value of 0 is "New" (not +Infinity%); both zero is "no
 * data"; null/undefined inputs (an unmeasurable metric) are "no data" too.
 */
export function change(current: number | null | undefined, previous: number | null | undefined): Change {
  if (current === null || current === undefined || previous === null || previous === undefined) return { kind: "none" };
  if (previous === 0) return current === 0 ? { kind: "none" } : { kind: "new" };
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.05) return { kind: "flat" };
  return { kind: pct > 0 ? "up" : "down", pct: Math.abs(pct) };
}

export function fmtChange(c: Change): string {
  switch (c.kind) {
    case "up": return `+${c.pct.toFixed(c.pct >= 100 ? 0 : 1)}%`;
    case "down": return `-${c.pct.toFixed(c.pct >= 100 ? 0 : 1)}%`;
    case "flat": return "0.0%";
    case "new": return "New";
    default: return "—";
  }
}

export function shortId(id: string | null | undefined): string {
  return id ? `${id.slice(0, 8)}` : "—";
}
