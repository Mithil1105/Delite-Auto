import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import clsx from "clsx";
import { EmptyState, InfoTip } from "./ui";

export interface Column<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** Sort key; a column without one isn't sortable. */
  sort?: (row: T) => number | string;
  align?: "left" | "right";
  help?: string;
  className?: string;
}

/**
 * Sortable, click-through table. Sorting/paging is client-side over the (already database-
 * aggregated, bounded) result set — never over raw events. Rows are keyboard-activatable.
 */
export function DataTable<T>({ columns, rows, rowKey, defaultSort, onRowClick, pageSize = 15, empty, caption }: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; defaultSort?: { key: string; dir: "asc" | "desc" };
  onRowClick?: (row: T) => void; pageSize?: number; empty?: ReactNode; caption?: string;
}) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const [shown, setShown] = useState(pageSize);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const get = col.sort;
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nothing to show" body="No rows for this period and filters." icon={false} />}</>;

  const toggle = (key: string) => setSort((s) => (s?.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-steel-500">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} scope="col" aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={clsx("py-2 px-3 font-semibold whitespace-nowrap", c.align === "right" ? "text-right" : "text-left")}>
                    <span className="inline-flex items-center gap-1">
                      {c.sort ? (
                        <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink">
                          {c.label}
                          {active ? (sort!.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
                        </button>
                      ) : c.label}
                      {c.help && <InfoTip text={c.help} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, shown).map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={clsx("border-b border-line last:border-b-0", onRowClick && "cursor-pointer hover:bg-steel-50/60 focus:bg-steel-50/60 focus:outline-none")}
              >
                {columns.map((c) => (
                  <td key={c.key} className={clsx("py-2.5 px-3 align-middle", c.align === "right" ? "text-right tabular-nums" : "text-left", c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > shown && (
        <div className="flex items-center justify-between mt-3 text-[12px] text-steel-500">
          <span>Showing {shown} of {sorted.length}</span>
          <button type="button" className="btn-ghost !px-3 !py-1.5" onClick={() => setShown((n) => n + pageSize * 2)}>Show more</button>
        </div>
      )}
    </div>
  );
}
