import clsx from "clsx";
import { Icon } from "../../lib/icons";

export interface PillTabOption {
  value: string;
  label: string;
  icon?: string;
}

export function PillTabs({
  options,
  value,
  onChange,
}: {
  options: PillTabOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={clsx(active ? "pill-tab-active" : "pill-tab hover:border-ink")}
          >
            {opt.icon && <Icon name={opt.icon} className="w-3.5 h-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
