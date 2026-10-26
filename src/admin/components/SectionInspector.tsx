import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listAllPosts } from "../../services/blog/blogService";
import { pickText, type BlogPost } from "../../lib/blog";
import { AdminProductPicker } from "./AdminProductPicker";
import { AdminMediaField, mediaPublicUrl } from "./AdminMediaPicker";

type Field = { key: string; label: string; kind?: "textarea" | "url" | "image" | "post" | "select" | "toggle"; hint?: string; options?: { value: string; label: string }[] };

/** Drop-down of blog posts (for feature blocks that take their content from a post). */
function PostSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  useEffect(() => {
    listAllPosts().then(setPosts);
  }, []);
  return (
    <label className="block text-sm font-medium">
      {label}
      <select className="mt-1 h-11 w-full border border-line bg-white px-3 text-[14px]" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">None — I'll write it here</option>
        {(posts ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {pickText(p.title, "en")}
            {p.status !== "published" ? " (draft)" : ""}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-xs font-normal text-steel-500">Anything you leave empty below is filled from the post (category, title, summary, cover picture and a "Read article" button). The block only shows once the post is published.</span>
    </label>
  );
}

const FEATURE_BLOCK = {
  title: "Feature block (text + picture)",
  fields: [
    { key: "postId", label: "Take the content from a blog post (optional)", kind: "post" },
    { key: "eyebrow", label: "Small label (e.g. Car Safety)" },
    { key: "title", label: "Big heading" },
    { key: "text", label: "Paragraph", kind: "textarea" },
    { key: "buttonLabel", label: "Button text (optional)" },
    { key: "buttonLink", label: "Button link (optional)", kind: "url" },
    { key: "image", label: "Picture", kind: "image" },
    { key: "imageAlt", label: "Picture description (for screen readers)" },
    { key: "imageSide", label: "Picture position", kind: "select", options: [{ value: "right", label: "Picture on the right" }, { value: "left", label: "Picture on the left" }] },
    { key: "imageFit", label: "Picture fit", kind: "select", options: [{ value: "contain", label: "Show the whole picture (logos, products)" }, { value: "cover", label: "Fill the box (photos)" }] },
    { key: "plain", label: "Show as plain page content instead of a card", kind: "toggle", hint: "On: no background colour, no box around the picture, no rounded corners — the block blends into the home page like part of it. Off: the usual card look." },
    { key: "background", label: "Background (card style only)", kind: "select", options: [{ value: "white", label: "White" }, { value: "grey", label: "Light grey" }, { value: "dark", label: "Dark" }] },
    { key: "productsTitle", label: "Product row heading (optional)" },
    { key: "productsLink", label: "Product row \"See all\" link (optional)", kind: "url" },
  ] as Field[],
};

export const PRODUCT_TABS: Record<string, { key: string; label: string }[]> = {
  "top-categories-car": [{ key: "seatCoversIds", label: "Seat Covers" }, { key: "dashCamsIds", label: "Dash Cams" }, { key: "matsIds", label: "Mats" }, { key: "careIds", label: "Care" }],
  "trending-accessories": [{ key: "productIds", label: "Trending accessories" }],
  "feature-block-1": [{ key: "productIds", label: "Products under this block (optional row)" }],
  "feature-block-2": [{ key: "productIds", label: "Products under this block (optional row)" }],
  "feature-block-3": [{ key: "productIds", label: "Products under this block (optional row)" }],
  "feature-block-4": [{ key: "productIds", label: "Products under this block (optional row)" }],
  "top-categories-bike": [{ key: "allIds", label: "All Accessories" }, { key: "seatCoversIds", label: "Seat Covers" }, { key: "matsIds", label: "Mats" }, { key: "coversIds", label: "Covers" }],
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
  "trending-accessories": { title: "Trending Accessories", fields: [{ key: "title", label: "Heading" }, { key: "ctaLabel", label: "View all label" }, { key: "ctaLink", label: "View all link", kind: "url" }] },
  "blog-latest": { title: "Latest from the blog", fields: [{ key: "title", label: "Heading" }, { key: "ctaLabel", label: "View all label" }], related: "/admin/website/blog" },
  "feature-block-1": FEATURE_BLOCK,
  "feature-block-2": FEATURE_BLOCK,
  "feature-block-3": FEATURE_BLOCK,
  "feature-block-4": FEATURE_BLOCK,
  "image-banner-1": { title: "Landscape image", fields: [{ key: "image", label: "Image (landscape, e.g. 1920 x 600 — shown full width, never cropped)", kind: "image" }, { key: "alt", label: "Image description (for screen readers)" }, { key: "link", label: "Link when clicked (optional)", kind: "url" }] },
  "image-banner-2": { title: "Landscape image", fields: [{ key: "image", label: "Image (landscape, e.g. 1920 x 600 — shown full width, never cropped)", kind: "image" }, { key: "alt", label: "Image description (for screen readers)" }, { key: "link", label: "Link when clicked (optional)", kind: "url" }] },
  "image-banner-3": { title: "Landscape image", fields: [{ key: "image", label: "Image (landscape, e.g. 1920 x 600 — shown full width, never cropped)", kind: "image" }, { key: "alt", label: "Image description (for screen readers)" }, { key: "link", label: "Link when clicked (optional)", kind: "url" }] },
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
        if (field.kind === "post") {
          return <PostSelect key={field.key} label={field.label} value={typeof content[field.key] === "string" ? (content[field.key] as string) : ""} onChange={(v) => onChange(field.key, v)} />;
        }
        if (field.kind === "toggle") {
          const on = content[field.key] === true;
          return (
            <div key={field.key} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-steel-50 px-3 py-2.5">
              <div className="text-sm">
                <div className="font-semibold">{field.label}</div>
                {field.hint && <div className="mt-0.5 text-xs text-steel-500">{field.hint}</div>}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={field.label}
                onClick={() => onChange(field.key, !on)}
                className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-emerald-600" : "bg-steel-300"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
          );
        }
        if (field.kind === "select") {
          return (
            <label key={field.key} className="block text-sm font-medium">
              {field.label}
              <select className="mt-1 h-11 w-full border border-line bg-white px-3 text-[14px]" value={String(content[field.key] ?? field.options?.[0]?.value ?? "")} onChange={(e) => onChange(field.key, e.target.value)}>
                {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
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
