/**
 * Date ranges for Delite Admin analytics. The database stores timestamptz (UTC); the STORE thinks
 * in India Standard Time. Everything here resolves "today", "yesterday", "last 7 days" … against
 * IST midnight, so a report never shifts by a day around midnight UTC (which is 05:30 IST).
 *
 * IST has no daylight saving (fixed UTC+05:30), so plain arithmetic is exact — no date library
 * needed. If the store ever moves to a DST timezone this is the one file to change.
 */

export const STORE_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 5.5 * 3_600_000;
const DAY = 86_400_000;

export type RangePreset = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";
export type CompareMode = "off" | "previous" | "year";
export type Bucket = "hour" | "day" | "week";

export interface DateRange {
  start: Date;                // inclusive
  end: Date;                  // exclusive
  bucket: Bucket;
  label: string;
}

export const PRESET_LABELS: Record<RangePreset, string> = {
  today: "Today", yesterday: "Yesterday", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days", custom: "Custom",
};

/** IST midnight at or before `ms`. */
export function startOfDayIST(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY) * DAY - IST_OFFSET_MS;
}

/** Parses "YYYY-MM-DD" as IST midnight; null when malformed. */
export function parseISTDate(value: string | null | undefined): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const utcMidnight = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(utcMidnight) ? utcMidnight - IST_OFFSET_MS : null;
}

export function formatISTDate(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function chooseBucket(startMs: number, endMs: number): Bucket {
  const days = (endMs - startMs) / DAY;
  if (days <= 2.01) return "hour";
  if (days <= 92.01) return "day";
  return "week";
}

export function resolveRange(preset: RangePreset, nowMs: number, custom?: { from?: string | null; to?: string | null }): DateRange {
  const today = startOfDayIST(nowMs);
  let start: number;
  let end: number;
  switch (preset) {
    case "today": start = today; end = nowMs; break;
    case "yesterday": start = today - DAY; end = today; break;
    case "7d": start = today - 6 * DAY; end = nowMs; break;
    case "90d": start = today - 89 * DAY; end = nowMs; break;
    case "custom": {
      const from = parseISTDate(custom?.from);
      const to = parseISTDate(custom?.to);
      if (from !== null && to !== null && to >= from) {
        start = from;
        end = to + DAY;                          // the "to" date is inclusive
        break;
      }
      // Malformed custom input falls back to the default rather than throwing.
      start = today - 29 * DAY; end = nowMs; break;
    }
    case "30d":
    default: start = today - 29 * DAY; end = nowMs; break;
  }
  return { start: new Date(start), end: new Date(Math.max(end, start + 1)), bucket: chooseBucket(start, end), label: PRESET_LABELS[preset] };
}

/** The comparison window: the equal-length period immediately before, or the same dates a year earlier. */
export function comparisonRange(range: DateRange, mode: CompareMode): DateRange | null {
  if (mode === "off") return null;
  const s = range.start.getTime();
  const e = range.end.getTime();
  if (mode === "previous") return { start: new Date(s - (e - s)), end: new Date(s), bucket: range.bucket, label: "vs previous" };
  const year = 365 * DAY;
  return { start: new Date(s - year), end: new Date(e - year), bucket: range.bucket, label: "vs last year" };
}

export function describeRange(range: DateRange): string {
  const last = new Date(range.end.getTime() - 1);
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: STORE_TZ });
  const a = fmt(range.start);
  const b = fmt(last);
  return a === b ? a : `${a} – ${b}`;
}

/** Bucket label for a series point ("2026-09-21T14:00:00" is already IST wall-clock from the RPC). */
export function formatBucket(iso: string, bucket: Bucket): string {
  const [date, time = "00:00:00"] = iso.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
  if (bucket === "hour") return `${time.slice(0, 5)}`;
  if (bucket === "week") return `${d} ${month}`;
  return `${d} ${month}`;
}
