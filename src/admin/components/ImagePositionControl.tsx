import { useState } from "react";
import { RotateCcw, Monitor, Tablet, Smartphone } from "lucide-react";
import { DEFAULT_IMAGE_POSITION, imagePositionStyle, type ImagePosition, type ImagePositionByDevice } from "../../lib/media/imagePosition";

export type { ImagePosition, ImagePositionByDevice };
export { DEFAULT_IMAGE_POSITION, imagePositionStyle };

const DEVICES: { key: keyof ImagePositionByDevice; label: string; icon: typeof Monitor }[] = [
  { key: "desktop", label: "Desktop", icon: Monitor },
  { key: "tablet", label: "Tablet", icon: Tablet },
  { key: "mobile", label: "Mobile", icon: Smartphone },
];

/**
 * Focal X/Y + zoom + reset, with a per-device tab so the same image can be positioned differently
 * on desktop/tablet/mobile (e.g. a wide banner's subject needs to sit differently in a narrow
 * mobile crop). Values are stored in the section's own draft content jsonb — no new database
 * schema, consistent with how every other CMS field in this project already lives in `content`.
 */
export function ImagePositionControl({
  imageUrl,
  value,
  onChange,
}: {
  imageUrl: string | undefined;
  value: ImagePositionByDevice | undefined;
  onChange: (next: ImagePositionByDevice) => void;
}) {
  const [device, setDevice] = useState<keyof ImagePositionByDevice>("desktop");
  const current = value?.[device] ?? DEFAULT_IMAGE_POSITION;

  const update = (patch: Partial<ImagePosition>) => {
    onChange({ ...value, [device]: { ...current, ...patch } });
  };
  const reset = () => {
    const next = { ...value };
    delete next[device];
    onChange(next);
  };

  if (!imageUrl) return null;

  return (
    <div className="border border-line p-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <div className="inline-flex items-center rounded-full border border-line bg-white p-[3px]">
          {DEVICES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setDevice(key)}
              aria-pressed={device === key}
              title={label}
              className={`grid place-items-center w-6 h-6 rounded-full transition-colors ${device === key ? "bg-ink text-white" : "text-steel-500 hover:text-ink"}`}
            >
              <Icon className="w-3 h-3" />
            </button>
          ))}
        </div>
        <button type="button" onClick={reset} disabled={!value?.[device]} className="inline-flex items-center gap-1 text-[11px] text-steel-500 hover:text-ink disabled:opacity-30">
          <RotateCcw className="w-3 h-3" /> Reset {device}
        </button>
      </div>

      <div className="w-full h-32 overflow-hidden bg-steel-100 mb-2">
        <img src={imageUrl} alt="" className="w-full h-full" style={imagePositionStyle(current)} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="text-[10.5px] text-steel-500">
          Focal X
          <input type="range" min={0} max={100} value={current.x} onChange={(e) => update({ x: Number(e.target.value) })} className="w-full" />
        </label>
        <label className="text-[10.5px] text-steel-500">
          Focal Y
          <input type="range" min={0} max={100} value={current.y} onChange={(e) => update({ y: Number(e.target.value) })} className="w-full" />
        </label>
        <label className="text-[10.5px] text-steel-500">
          Zoom
          <input type="range" min={1} max={2.5} step={0.05} value={current.zoom} onChange={(e) => update({ zoom: Number(e.target.value) })} className="w-full" />
        </label>
      </div>
    </div>
  );
}
