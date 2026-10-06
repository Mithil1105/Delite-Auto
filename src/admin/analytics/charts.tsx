import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, LineChart as LineIcon } from "lucide-react";
import clsx from "clsx";
import { formatBucket, type Bucket } from "./dateRange";
import { fmtNumber, fmtPercent } from "./format";

/**
 * Chart conventions (dataviz skill): one y-axis, thin 2px lines with no dots, recessive grid,
 * crosshair tooltip, visible legend that also toggles series, and a table view. Categorical hues
 * are the first three slots of the validated palette — they clear every colour-vision-deficiency
 * separation check as a set (see Documentations MD/delite-analytics.md, "Chart palette"); slot 3's
 * low contrast on white is the reason the legend is always visible and a table view exists.
 */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"] as const;
const AXIS = "#56707c";      // steel-500
const GRID = "#e3e7e8";      // line

export interface SeriesDef<T> { key: keyof T & string; label: string; color?: string; format?: (n: number) => string }

export function TrendChart<T extends { bucket: string }>({ data, series, bucket, height = 260, yLabel, title }: {
  data: T[]; series: SeriesDef<T>[]; bucket: Bucket; height?: number; yLabel: string; title: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [table, setTable] = useState(false);
  const visible = series.filter((s) => !hidden.has(s.key));
  const toggle = (key: string) => setHidden((h) => { const n = new Set(h); if (n.has(key)) n.delete(key); else if (visible.length > 1) n.add(key); return n; });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Series">
          {series.map((s, i) => {
            const on = !hidden.has(s.key);
            const color = s.color ?? SERIES_COLORS[i % SERIES_COLORS.length];
            return (
              <li key={s.key}>
                <button type="button" onClick={() => toggle(s.key)} aria-pressed={on} className={clsx("inline-flex items-center gap-1.5 text-[12px]", on ? "text-ink" : "text-steel-300 line-through")}>
                  <span className="inline-block w-3 h-[3px]" style={{ background: on ? color : "#c9d3d8" }} aria-hidden />
                  {s.label}
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={() => setTable((t) => !t)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-500 hover:underline" aria-pressed={table}>
          {table ? <LineIcon className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
          {table ? "View chart" : "View as table"}
        </button>
      </div>

      {table ? (
        <div className="overflow-auto max-h-[300px] border border-line">
          <table className="w-full text-[12.5px]">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-white"><tr className="text-left text-[11px] uppercase text-steel-500 border-b border-line">
              <th className="p-2">{bucket === "hour" ? "Hour" : bucket === "week" ? "Week of" : "Day"}</th>
              {series.map((s) => <th key={s.key} className="p-2 text-right">{s.label}</th>)}
            </tr></thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.bucket} className="border-b border-line last:border-0">
                  <td className="p-2">{formatBucket(d.bucket, bucket)}</td>
                  {series.map((s) => <td key={s.key} className="p-2 text-right tabular-nums">{(s.format ?? fmtNumber)(Number(d[s.key]))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={`${title}. ${series.map((s) => s.label).join(", ")} over time.`} style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="bucket" tickFormatter={(v: string) => formatBucket(v, bucket)} tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false}
                minTickGap={28} label={{ value: bucket === "hour" ? "Hour (IST)" : bucket === "week" ? "Week starting (IST)" : "Day (IST)", position: "insideBottom", offset: -2, fill: AXIS, fontSize: 11 }} height={38} />
              <YAxis allowDecimals={false} width={44} tick={{ fill: AXIS, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtNumber(v)}
                label={{ value: yLabel, angle: -90, position: "insideLeft", fill: AXIS, fontSize: 11, offset: 12 }} />
              <Tooltip cursor={{ stroke: AXIS, strokeDasharray: "3 3" }} content={<ChartTooltip bucket={bucket} series={series} />} />
              {visible.map((s) => {
                const i = series.findIndex((x) => x.key === s.key);
                return <Line key={s.key} type="linear" dataKey={s.key} name={s.label} stroke={s.color ?? SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />;
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

interface TooltipProps<T> { active?: boolean; label?: string; payload?: { dataKey?: string; value?: number; color?: string }[]; bucket: Bucket; series: SeriesDef<T>[] }
function ChartTooltip<T>({ active, label, payload, bucket, series }: TooltipProps<T>) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="bg-white border border-line shadow-lift px-3 py-2 text-[12px]">
      <div className="font-semibold mb-1">{formatBucket(label, bucket)}</div>
      {payload.map((p) => {
        const def = series.find((s) => s.key === p.dataKey);
        return (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="text-steel-700">{def?.label}</span>
            <span className="ml-auto pl-4 font-semibold tabular-nums">{(def?.format ?? fmtNumber)(Number(p.value))}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Ranked horizontal bars (single hue — magnitude, not identity). Values are printed, so it is readable without colour. */
export function RankedBars({ rows, format = fmtNumber, empty = "No data for this period." }: { rows: { label: string; value: number; sub?: string; onClick?: () => void }[]; format?: (n: number) => string; empty?: string }) {
  if (rows.length === 0) return <p className="text-[12.5px] text-steel-500 py-4">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="truncate" title={r.label}>{r.label}{r.sub && <span className="text-steel-500"> · {r.sub}</span>}</span>
              <span className="font-semibold tabular-nums shrink-0">{format(r.value)}</span>
            </div>
            <div className="h-1.5 bg-steel-50 mt-1"><div className="h-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: SERIES_COLORS[0] }} /></div>
          </>
        );
        return <li key={r.label}>{r.onClick ? <button type="button" onClick={r.onClick} className="block w-full text-left hover:opacity-80">{inner}</button> : inner}</li>;
      })}
    </ul>
  );
}

/** Funnel over DISTINCT sessions (or visitors) at each step — never mixes event counts with unique counts. */
export function FunnelBars({ steps }: { steps: { label: string; value: number }[] }) {
  const start = steps[0]?.value ?? 0;
  return (
    <ol className="space-y-2.5" data-testid="funnel">
      {steps.map((s, i) => {
        const prev = i === 0 ? null : steps[i - 1].value;
        const drop = prev && prev > 0 ? Math.max(0, ((prev - s.value) / prev) * 100) : null;
        return (
          <li key={s.label}>
            <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="font-medium">{s.label}</span>
              <span className="tabular-nums">
                <strong>{fmtNumber(s.value)}</strong>
                {i > 0 && <span className="text-steel-500"> · {fmtPercent(s.value, prev ?? 0)} of previous · {fmtPercent(s.value, start)} of start</span>}
              </span>
            </div>
            <div className="h-2.5 bg-steel-50 mt-1"><div className="h-full" style={{ width: `${start ? Math.max(1.5, (s.value / start) * 100) : 0}%`, background: SERIES_COLORS[0], opacity: 1 - i * 0.1 }} /></div>
            {drop !== null && <div className="text-[11px] text-steel-500 mt-0.5">↓ {drop.toFixed(1)}% drop-off from the previous step</div>}
          </li>
        );
      })}
    </ol>
  );
}
