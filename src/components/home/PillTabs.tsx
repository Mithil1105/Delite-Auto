import clsx from "clsx";
import { Icon } from "../../lib/icons";

export interface PillTabOption {
  value: string;
  label: string;
  icon?: string;
}

/**
 * `variant="segmented"` (opt-in, default stays "pill") renders the Figma compact capsule control
 * — one bordered outer container, buttons immediately adjacent with no gap, active = dark fill.
 * Every existing PillTabs consumer (Trending/Perfect-Vehicle/Brands car-bike tabs, Popular/New
 * tabs) renders with the exact same "pill" markup as before, so they cannot regress — see
 * Documentations MD/frontend-foundation-uiux-refactor.md.
 */
export function PillTabs({
  options,
  value,
  onChange,
  variant = "pill",
}: {
  options: PillTabOption[];
  value: string;
  onChange: (value: string) => void;
  variant?: "pill" | "segmented";
}) {
  if (variant === "segmented") {
    return (
      <div className="segment-tabs" role="tablist">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.value)}
              className={active ? "segment-tab-active" : "segment-tab"}
            >
              {opt.icon && <Icon name={opt.icon} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

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
