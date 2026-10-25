import { useState, type ReactNode } from "react";
import { ChevronDown, LayoutGrid, List, SlidersHorizontal, X } from "lucide-react";
import clsx from "clsx";

/**
 * Building blocks for product-listing pages (Shop, a car's accessories page): the "Filters" card with
 * chip groups and segmented controls, and the heading / filters / sort / grid-list toolbar. Modelled
 * on the Framer reference the client supplied. Purely presentational — each page owns its filter state
 * (URL params on Shop, local state on a car page). Search lives in the site header, not here.
 */

/* ───────── Filters card ───────── */

/** The filters panel. `onClose` (desktop) adds a "hide" button so shoppers can collapse the panel and give the grid the full width. */
export function FilterCard({
  title,
  resetLabel,
  onReset,
  closeLabel,
  onClose,
  children,
  className,
}: {
  title: string;
  resetLabel: string;
  onReset?: () => void;
  closeLabel?: string;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rounded-2xl border border-line bg-white", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
        <h2 className="font-sans text-[15px] font-semibold normal-case tracking-normal">{title}</h2>
        <div className="flex items-center gap-2">
          {onReset && (
            <button type="button" onClick={onReset} className="text-[13px] font-medium underline underline-offset-2 transition-colors hover:text-brand-700">
              {resetLabel}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              title={closeLabel}
              className="grid h-8 w-8 place-items-center rounded-full text-steel-500 transition-colors hover:bg-steel-100 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

export function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 py-4">
      <h3 className="mb-3 font-sans text-[13px] font-semibold normal-case tracking-normal">{title}</h3>
      {children}
    </div>
  );
}

/* ───────── Chips ───────── */

/** A pill filter option. Selected = solid black, like the reference. */
export function Chip({ selected, onClick, children, count }: { selected: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={clsx(
        "inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-medium transition-colors",
        selected ? "border-ink bg-ink text-white" : "border-line bg-white text-steel-700 hover:border-ink hover:text-ink"
      )}
    >
      {children}
      {count !== undefined && <span className={selected ? "text-white/70" : "text-steel-500"}>({count})</span>}
    </button>
  );
}

export interface ChipItem {
  value: string;
  label: string;
  count?: number;
}

/**
 * Single-select chip group with an optional leading "All" chip and a "Show more" toggle for long
 * lists. A selected chip that would be hidden by the limit is always kept visible.
 */
export function ChipGroup({
  items,
  selected,
  onSelect,
  allLabel,
  limit = 10,
  showMoreLabel,
  showLessLabel,
}: {
  items: ChipItem[];
  selected: string;
  onSelect: (value: string) => void;
  allLabel?: string;
  limit?: number;
  showMoreLabel: string;
  showLessLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const overflow = items.length > limit;
  let visible = expanded || !overflow ? items : items.slice(0, limit);
  if (!expanded && overflow) {
    const sel = items.find((i) => i.value === selected);
    if (sel && !visible.includes(sel)) visible = [...visible, sel];
  }
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {allLabel !== undefined && (
          <Chip selected={selected === ""} onClick={() => onSelect("")}>
            {allLabel}
          </Chip>
        )}
        {visible.map((i) => (
          <Chip key={i.value} selected={selected === i.value} onClick={() => onSelect(selected === i.value ? "" : i.value)} count={i.count}>
            {i.label}
          </Chip>
        ))}
      </div>
      {overflow && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-3 text-[12.5px] font-semibold text-brand-700 hover:underline">
          {expanded ? showLessLabel : showMoreLabel}
        </button>
      )}
    </div>
  );
}

/* ───────── Segmented control ───────── */

export function Segmented({ options, value, onChange, label }: { options: { value: string; label: string }[]; value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <div role="group" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-steel-100 p-1">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={clsx("h-9 rounded-lg px-2 text-[13px] font-medium transition-all", active ? "bg-white text-ink shadow-card" : "text-steel-600 hover:text-ink")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────── Sort + view ───────── */

export function SortSelect({ value, onChange, options, label, className }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; label: string; className?: string }) {
  return (
    <label className={clsx("relative inline-flex items-center", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-10 w-full min-w-0 cursor-pointer appearance-none rounded-lg border border-line bg-white pl-3.5 pr-9 text-[14px] transition-colors hover:border-ink focus:border-ink focus:outline-none sm:min-w-[9.5rem]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-steel-500" />
    </label>
  );
}

export function ViewToggle({ value, onChange, gridLabel, listLabel }: { value: "grid" | "list"; onChange: (value: "grid" | "list") => void; gridLabel: string; listLabel: string }) {
  const items = [
    { value: "grid" as const, label: gridLabel, Icon: LayoutGrid },
    { value: "list" as const, label: listLabel, Icon: List },
  ];
  return (
    <div role="group" aria-label={`${gridLabel} / ${listLabel}`} className="inline-flex shrink-0 gap-1 rounded-lg bg-steel-100 p-1">
      {items.map(({ value: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          aria-label={label}
          title={label}
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={clsx("grid h-8 w-9 place-items-center rounded-md transition-all", value === v ? "bg-white text-ink shadow-card" : "text-steel-500 hover:text-ink")}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

/* ───────── Toolbar ───────── */

/**
 * Heading + result count on the left; Filters button, sort and grid/list switch on the right. On a
 * phone the heading sits on its own line and the controls fill one row below it (Filters button,
 * a flexible sort menu, view switch). The Filters button opens the drawer below `lg` and shows/hides
 * the sidebar from `lg` up.
 */
export function ListingToolbar({
  title,
  subtitle,
  filtersLabel,
  activeCount,
  sidebarOpen,
  onToggleSidebar,
  onOpenDrawer,
  sortSlot,
  viewSlot,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  filtersLabel: string;
  activeCount: number;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onOpenDrawer: () => void;
  sortSlot: ReactNode;
  viewSlot: ReactNode;
}) {
  const badge = activeCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] text-white">{activeCount}</span>;
  const buttonBase = "h-10 items-center gap-1.5 rounded-lg border px-3.5 text-[14px] font-medium transition-colors";
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {title}
        {subtitle}
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <button type="button" onClick={onOpenDrawer} className={clsx(buttonBase, "inline-flex shrink-0 border-line bg-white hover:border-ink lg:hidden")}>
          <SlidersHorizontal className="h-4 w-4" /> {filtersLabel}
          {badge}
        </button>
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-pressed={sidebarOpen}
          className={clsx(buttonBase, "hidden shrink-0 lg:inline-flex", sidebarOpen ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink")}
        >
          <SlidersHorizontal className="h-4 w-4" /> {filtersLabel}
          {activeCount > 0 && <span className={clsx("grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px]", sidebarOpen ? "bg-white text-ink" : "bg-ink text-white")}>{activeCount}</span>}
        </button>
        <div className="min-w-0 flex-1 sm:flex-none">{sortSlot}</div>
        {viewSlot}
      </div>
    </div>
  );
}
