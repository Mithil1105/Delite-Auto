import { describe, expect, it } from "vitest";
import { chooseBucket, comparisonRange, formatISTDate, parseISTDate, resolveRange, startOfDayIST } from "./dateRange";
import { change, fmtChange, fmtDuration, fmtPercent, fmtSince } from "./format";

// 2026-09-21 20:00 UTC == 2026-09-22 01:30 IST — the awkward window where UTC and IST disagree on the date.
const NOW = Date.parse("2026-09-21T20:00:00.000Z");

describe("IST date ranges (no off-by-one around midnight)", () => {
  it("start of day uses IST midnight, not UTC midnight", () => {
    // IST midnight of 2026-09-22 is 2026-09-21T18:30:00Z
    expect(new Date(startOfDayIST(NOW)).toISOString()).toBe("2026-09-21T18:30:00.000Z");
  });

  it("'Today' begins at IST midnight even when UTC still says yesterday", () => {
    const r = resolveRange("today", NOW);
    expect(r.start.toISOString()).toBe("2026-09-21T18:30:00.000Z");
    expect(r.bucket).toBe("hour");
  });

  it("'Yesterday' is exactly one IST day", () => {
    const r = resolveRange("yesterday", NOW);
    expect(r.end.getTime() - r.start.getTime()).toBe(86_400_000);
    expect(r.end.toISOString()).toBe("2026-09-21T18:30:00.000Z");
  });

  it("'Last 7 days' is 7 IST calendar days including today", () => {
    const r = resolveRange("7d", NOW);
    expect(formatISTDate(r.start.getTime())).toBe("2026-09-16");
    expect(r.bucket).toBe("day");
  });

  it("custom range treats the end date as inclusive", () => {
    const r = resolveRange("custom", NOW, { from: "2026-09-01", to: "2026-09-03" });
    expect(formatISTDate(r.start.getTime())).toBe("2026-09-01");
    expect(r.end.getTime() - r.start.getTime()).toBe(3 * 86_400_000);
  });

  it("malformed custom input falls back instead of throwing", () => {
    const r = resolveRange("custom", NOW, { from: "garbage", to: null });
    expect(r.end.getTime()).toBeGreaterThan(r.start.getTime());
    expect(parseISTDate("2026-13-99")).toBeNull();
  });

  it("chooses hour/day/week granularity so charts never carry hundreds of points", () => {
    const D = 86_400_000;
    expect(chooseBucket(0, D)).toBe("hour");
    expect(chooseBucket(0, 30 * D)).toBe("day");
    expect(chooseBucket(0, 90 * D)).toBe("day");
    expect(chooseBucket(0, 400 * D)).toBe("week");
  });

  it("comparison windows: previous period is the equal-length window immediately before", () => {
    const r = resolveRange("7d", NOW);
    const p = comparisonRange(r, "previous")!;
    expect(p.end.getTime()).toBe(r.start.getTime());
    expect(p.end.getTime() - p.start.getTime()).toBe(r.end.getTime() - r.start.getTime());
    expect(comparisonRange(r, "off")).toBeNull();
    const y = comparisonRange(r, "year")!;
    expect(r.start.getTime() - y.start.getTime()).toBe(365 * 86_400_000);
  });
});

describe("period-over-period change semantics", () => {
  it("never produces Infinity%: a zero baseline is 'New'", () => {
    expect(change(12, 0)).toEqual({ kind: "new" });
    expect(fmtChange(change(12, 0))).toBe("New");
  });

  it("zero in both periods (or an unmeasurable metric) is 'no data', not 0%", () => {
    expect(change(0, 0)).toEqual({ kind: "none" });
    expect(change(null, 5)).toEqual({ kind: "none" });
    expect(change(5, undefined)).toEqual({ kind: "none" });
    expect(fmtChange(change(0, 0))).toBe("—");
  });

  it("computes real percentages with direction", () => {
    expect(fmtChange(change(112.4, 100))).toBe("+12.4%");
    expect(fmtChange(change(96.9, 100))).toBe("-3.1%");
    expect(change(100, 100)).toEqual({ kind: "flat" });
    expect(fmtChange(change(300, 100))).toBe("+200%");
  });

  it("a drop to zero is -100%", () => {
    expect(fmtChange(change(0, 40))).toBe("-100%");
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    expect(fmtDuration(45)).toBe("45s");
    expect(fmtDuration(192)).toBe("3m 12s");
    expect(fmtDuration(3900)).toBe("1h 05m");
    expect(fmtDuration(null)).toBe("—");
  });

  it("percent guards against divide-by-zero and shows small rates precisely", () => {
    expect(fmtPercent(1, 0)).toBe("—");
    expect(fmtPercent(50, 200)).toBe("25.0%");
    expect(fmtPercent(1, 400)).toBe("0.25%");
  });

  it("describes elapsed time", () => {
    expect(fmtSince(0.2)).toBe("just now");
    expect(fmtSince(45)).toBe("45 min ago");
    expect(fmtSince(60 * 5)).toBe("5 h ago");
    expect(fmtSince(60 * 24 * 4)).toBe("4 d ago");
  });
});
