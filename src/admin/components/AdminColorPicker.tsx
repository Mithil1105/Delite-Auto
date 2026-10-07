import { useId, useState } from "react";

export function normalizeHex(input: string): string | null {
  const value = input.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(value)) return `#${[...value].map((c) => c + c).join("").toUpperCase()}`;
  return /^[\da-f]{6}$/i.test(value) ? `#${value.toUpperCase()}` : null;
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function contrastRatio(background: string, foreground: string) {
  const a = normalizeHex(background), b = normalizeHex(foreground);
  if (!a || !b) return 1;
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export function suggestedTextColor(background: string) {
  return contrastRatio(background, "#FFFFFF") >= contrastRatio(background, "#111827") ? "#FFFFFF" : "#111827";
}

export function AdminColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  const [typing, setTyping] = useState<string | null>(null);
  const invalid = typing !== null && normalizeHex(typing) === null;
  return <div>
    <label htmlFor={id} className="block text-xs text-steel-500 mb-1">{label}</label>
    <div className="flex items-center gap-2">
      <input type="color" value={normalizeHex(value) ?? "#000000"} onChange={(event) => onChange(event.target.value.toUpperCase())} aria-label={`${label} color wheel`} className="h-10 w-12 cursor-pointer rounded border border-line bg-white" />
      <input id={id} type="text" value={typing ?? value} aria-invalid={invalid || undefined} onFocus={() => setTyping(value)} onChange={(event) => {
        setTyping(event.target.value);
        const hex = normalizeHex(event.target.value);
        if (hex) onChange(hex);
      }} onBlur={() => setTyping(null)} className={`w-28 rounded border bg-white px-2 py-2 font-mono text-sm ${invalid ? "border-red-500" : "border-line"}`} />
    </div>
    {invalid && <p className="mt-1 text-xs text-red-600">Enter a hex color, such as #123 or #112233.</p>}
  </div>;
}
