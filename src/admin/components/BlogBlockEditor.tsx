import { ArrowDown, ArrowUp, Heading2, Image as ImageIcon, Images, Plus, Quote, Trash2, Type } from "lucide-react";
import type { BlogBlock } from "../../lib/blog";
import { AdminMediaField, mediaPublicUrl } from "./AdminMediaPicker";

const inputClass = "w-full px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";
const labelClass = "block text-[12px] uppercase tracking-wide mb-1.5 text-steel-500";

const BLOCK_LABEL: Record<BlogBlock["type"], string> = { heading: "Heading", paragraph: "Text", quote: "Quote", image: "Picture", gallery: "Photo gallery" };

const ADD_BUTTONS: { type: BlogBlock["type"]; label: string; Icon: typeof Type }[] = [
  { type: "heading", label: "Heading", Icon: Heading2 },
  { type: "paragraph", label: "Text", Icon: Type },
  { type: "image", label: "Picture", Icon: ImageIcon },
  { type: "gallery", label: "Gallery", Icon: Images },
  { type: "quote", label: "Quote", Icon: Quote },
];

const blank = (type: BlogBlock["type"]): BlogBlock => {
  switch (type) {
    case "heading":
    case "paragraph":
      return { type, text: "" };
    case "quote":
      return { type, text: "", by: "" };
    case "image":
      return { type, src: "", alt: "", caption: "" };
    case "gallery":
      return { type, images: [] };
  }
};

/** Image fields store the public URL (like the other CMS image fields); the picker works with storage paths. */
const urlFromPath = (path: string | undefined) => (path ? mediaPublicUrl(path) : "");

/**
 * The article body editor: a vertical list of simple blocks (heading, text, picture, gallery, quote). Staff add blocks
 * with the buttons, reorder with the arrows and never see HTML. Blocks that are still empty are ignored on save.
 */
export function BlogBlockEditor({ blocks, onChange }: { blocks: BlogBlock[]; onChange: (blocks: BlogBlock[]) => void }) {
  const update = (i: number, next: BlogBlock) => onChange(blocks.map((b, idx) => (idx === i ? next : b)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...blocks];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {blocks.length === 0 && <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13.5px] text-steel-500">Nothing here yet — add a heading, some text or a picture below.</p>}

      {blocks.map((b, i) => (
        <div key={i} className="card-surface space-y-3 p-4">
          <div className="flex items-center justify-between">
            <strong className="text-[13px]">{BLOCK_LABEL[b.type]}</strong>
            <div className="flex items-center gap-1">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" className="grid h-8 w-8 place-items-center rounded hover:bg-steel-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" disabled={i === blocks.length - 1} onClick={() => move(i, 1)} aria-label="Move down" className="grid h-8 w-8 place-items-center rounded hover:bg-steel-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => onChange(blocks.filter((_, idx) => idx !== i))} aria-label="Remove block" className="grid h-8 w-8 place-items-center rounded text-sale hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>

          {b.type === "heading" && <input className={`${inputClass} h-11`} value={b.text} maxLength={150} placeholder="Section heading" onChange={(e) => update(i, { ...b, text: e.target.value })} />}

          {b.type === "paragraph" && (
            <textarea className={`${inputClass} py-2.5 leading-relaxed`} rows={5} value={b.text} maxLength={5000} placeholder="Write your text here. Press Enter twice for a new paragraph." onChange={(e) => update(i, { ...b, text: e.target.value })} />
          )}

          {b.type === "quote" && (
            <>
              <textarea className={`${inputClass} py-2.5`} rows={3} value={b.text} maxLength={1000} placeholder="The quote" onChange={(e) => update(i, { ...b, text: e.target.value })} />
              <label className={labelClass}>Who said it (optional)<input className={`${inputClass} h-11`} value={b.by ?? ""} maxLength={100} onChange={(e) => update(i, { ...b, by: e.target.value })} /></label>
            </>
          )}

          {b.type === "image" && (
            <>
              <AdminMediaField label="Picture" value={b.src || undefined} onChange={(path) => update(i, { ...b, src: urlFromPath(path) })} />
              <label className={labelClass}>Picture description (for people using screen readers)<input className={`${inputClass} h-11`} value={b.alt ?? ""} maxLength={200} onChange={(e) => update(i, { ...b, alt: e.target.value })} /></label>
              <label className={labelClass}>Caption under the picture (optional)<input className={`${inputClass} h-11`} value={b.caption ?? ""} maxLength={300} onChange={(e) => update(i, { ...b, caption: e.target.value })} /></label>
            </>
          )}

          {b.type === "gallery" && (
            <div className="space-y-3">
              {b.images.map((img, j) => (
                <div key={j} className="flex items-start gap-3 rounded-lg border border-line p-3">
                  <div className="flex-1">
                    <AdminMediaField label={`Photo ${j + 1}`} value={img.src || undefined} onChange={(path) => update(i, { ...b, images: b.images.map((x, k) => (k === j ? { ...x, src: urlFromPath(path) } : x)) })} />
                  </div>
                  <button type="button" onClick={() => update(i, { ...b, images: b.images.filter((_, k) => k !== j) })} aria-label={`Remove photo ${j + 1}`} className="mt-5 text-[12px] text-sale hover:underline">Remove</button>
                </div>
              ))}
              {b.images.length < 24 && (
                <button type="button" onClick={() => update(i, { ...b, images: [...b.images, { src: "", alt: "" }] })} className="btn-outline !px-3 !py-1.5 text-[12.5px]">Add a photo</button>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-steel-50 p-3">
        <span className="mr-1 inline-flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wide text-steel-500"><Plus className="h-3.5 w-3.5" /> Add</span>
        {ADD_BUTTONS.map(({ type, label, Icon }) => (
          <button key={type} type="button" onClick={() => onChange([...blocks, blank(type)])} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-ink">
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}
