import { Link } from "react-router-dom";
import { AdminProductPicker } from "./AdminProductPicker";
import { AdminMediaField, mediaPublicUrl } from "./AdminMediaPicker";

type Field = { key: string; label: string; kind?: "textarea" | "url" | "image" };

export const PRODUCT_TABS: Record<string, { key: string; label: string }[]> = {
  "top-categories-car": [{ key: "seatCoversIds", label: "Seat Covers" }, { key: "dashCamsIds", label: "Dash Cams" }, { key: "matsIds", label: "Mats" }, { key: "careIds", label: "Care" }],
  "top-categories-bike": [{ key: "helmetsIds", label: "Helmets" }, { key: "coversIds", label: "Covers" }, { key: "saddlebagsIds", label: "Saddlebags" }, { key: "guardsIds", label: "Guards" }],
};

/** The 9 "generic" Homepage sections' field config — a section not listed here (Hero) has its own
 * dedicated, materially different editor and is never rendered through this component (see
 * Documentations MD/delite-cms-visual-editor.md, "Homepage inspector scope"). */
export const sectionFields: Record<string, { title: string; fields: Field[]; related?: string }> = {
  "vehicle-shop-split": { title: "Shop by Cars / Bikes", fields: [
    { key: "carTitle", label: "Car heading" }, { key: "carLink", label: "Car link", kind: "url" },
    { key: "carImage", label: "Car image", kind: "image" }, { key: "bikeTitle", label: "Bike heading" },
    { key: "bikeLink", label: "Bike link", kind: "url" }, { key: "bikeImage", label: "Bike image", kind: "image" },
  ] },
  "category-strip": { title: "Category Icon Strip", fields: [{ key: "title", label: "Section heading" }], related: "/admin/merchandising/categories" },
  trending: { title: "Trending", fields: [{ key: "title", label: "Heading" }, { key: "ctaLabel", label: "View all label" }, { key: "ctaLink", label: "View all link", kind: "url" }, { key: "carLabel", label: "Car tab" }, { key: "bikeLabel", label: "Bike tab" }], related: "/admin/merchandising/trending" },
  "perfect-vehicle": { title: "Perfect Vehicle", fields: [{ key: "title", label: "Heading" }, { key: "ctaLabel", label: "View all label" }, { key: "ctaLink", label: "View all link", kind: "url" }, { key: "popularLabel", label: "Popular tab" }, { key: "newLabel", label: "New arrivals tab" }], related: "/admin/merchandising/featured" },
  brands: { title: "Brands", fields: [{ key: "title", label: "Heading" }, { key: "ctaLabel", label: "View all label" }, { key: "ctaLink", label: "View all link", kind: "url" }, { key: "carLabel", label: "Car tab" }, { key: "bikeLabel", label: "Bike tab" }, { key: "carBrands", label: "Car brand names (one per line)", kind: "textarea" }, { key: "bikeBrands", label: "Bike brand names (one per line)", kind: "textarea" }] },
  "top-categories-car": { title: "Top Categories — Car", fields: [{ key: "title", label: "Heading" }, { key: "ctaLabel", label: "View all label" }, { key: "ctaLink", label: "View all link", kind: "url" }, { key: "seatCoversLabel", label: "Seat Covers tab" }, { key: "dashCamsLabel", label: "Dash Cams tab" }, { key: "matsLabel", label: "Mats tab" }, { key: "careLabel", label: "Care tab" }] },
  "promo-banners": { title: "Promo Banners", fields: [{ key: "title", label: "Section label" }], related: "/admin/website/promotions" },
  "top-categories-bike": { title: "Top Categories — Bike", fields: [{ key: "title", label: "Heading" }, { key: "ctaLabel", label: "View all label" }, { key: "ctaLink", label: "View all link", kind: "url" }, { key: "helmetsLabel", label: "Helmets tab" }, { key: "coversLabel", label: "Covers tab" }, { key: "saddlebagsLabel", label: "Saddlebags tab" }, { key: "guardsLabel", label: "Guards tab" }] },
  testimonials: { title: "Testimonials", fields: [{ key: "title", label: "Heading" }] },
  "get-in-touch": { title: "Get In Touch", fields: [{ key: "title", label: "Heading" }, { key: "subtitle", label: "Intro text", kind: "textarea" }, { key: "buttonLabel", label: "Submit button label" }] },
};

const inputClass = "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none";

/** Field-editing form for one of the 9 generic Homepage sections — used both inline (Homepage's
 * 3-pane editor) and standalone (the `/admin/website/homepage/:sectionKey` deep link, which stays
 * a working route via HomeSectionEditor.tsx). Parameterized purely by sectionKey/content/onChange
 * so both callers share one implementation instead of two copies drifting apart. */
export function SectionInspector({
  sectionKey,
  content,
  onChange,
}: {
  sectionKey: string;
  content: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const config = sectionFields[sectionKey];
  if (!config) return <p className="text-sm text-steel-500">Unknown homepage section.</p>;

  const items = Array.isArray(content.items) ? (content.items as Record<string, unknown>[]) : [];

  return (
    <div className="space-y-4">
      {config.fields.map((field) => {
        if (field.kind === "image") {
          return (
            <AdminMediaField
              key={field.key}
              label={field.label}
              value={typeof content[field.key] === "string" ? (content[field.key] as string) : undefined}
              onChange={(path) => onChange(field.key, path ? mediaPublicUrl(path) : "")}
            />
          );
        }
        return (
          <label key={field.key} className="block text-sm font-medium">
            {field.label}
            {field.kind === "textarea" ? (
              <textarea rows={3} className={`${inputClass} mt-1`} value={String(content[field.key] ?? "")} onChange={(e) => onChange(field.key, e.target.value)} />
            ) : (
              <input type="text" className={`${inputClass} mt-1`} value={String(content[field.key] ?? "")} onChange={(e) => onChange(field.key, e.target.value)} />
            )}
          </label>
        );
      })}
      {sectionKey === "testimonials" && (
        <div className="space-y-3">
          <h2 className="font-semibold">Testimonials</h2>
          {items.map((item, index) => (
            <div key={index} className="rounded-xl border border-line p-3 space-y-2">
              {(["quote", "name", "productLabel"] as const).map((key) => (
                <label key={key} className="block text-xs capitalize">
                  {key}
                  <input
                    className={`${inputClass} mt-1`}
                    value={String(item[key] ?? "")}
                    onChange={(e) => {
                      const next = [...items];
                      next[index] = { ...item, [key]: e.target.value };
                      onChange("items", next);
                    }}
                  />
                </label>
              ))}
              <button className="text-xs text-sale" onClick={() => onChange("items", items.filter((_, i) => i !== index))}>Remove</button>
            </div>
          ))}
          <button className="btn-outline text-sm" onClick={() => onChange("items", [...items, { quote: "", name: "", productLabel: "" }])}>Add testimonial</button>
        </div>
      )}
      {PRODUCT_TABS[sectionKey]?.map((tab) => (
        <div key={tab.key} className="border-t border-line pt-5">
          <h2 className="font-semibold mb-2">{tab.label} products</h2>
          <p className="text-xs text-steel-500 mb-3">Leave empty for the automatic category selection.</p>
          <AdminProductPicker
            selectedIds={Array.isArray(content[tab.key]) ? (content[tab.key] as unknown[]).filter((id): id is number => Number.isSafeInteger(id)) : []}
            onChange={(ids) => onChange(tab.key, ids)}
            maxItems={8}
          />
        </div>
      ))}
      {config.related && <Link to={config.related} className="block text-sm text-brand-700 hover:underline">Edit section items and products →</Link>}
      {sectionKey === "perfect-vehicle" && <Link to="/admin/merchandising/new-arrivals" className="block text-sm text-brand-700 hover:underline">Edit New Arrivals products →</Link>}
    </div>
  );
}
