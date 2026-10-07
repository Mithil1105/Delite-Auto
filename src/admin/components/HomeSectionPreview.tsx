import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { VehicleShopSplit } from "../../components/home/VehicleShopSplit";
import { TestimonialCarousel } from "../../components/home/TestimonialCarousel";
import { GetInTouchBox } from "../../components/home/GetInTouchBox";
import { VehicleBrandGrid } from "../../components/home/VehicleBrandGrid";
import { PillTabs } from "../../components/home/PillTabs";
import { ProductCarousel } from "../../components/product/ProductCarousel";
import { CategoryIconStrip } from "../../components/home/CategoryIconStrip";
import { PromoBannerPair } from "../../components/home/PromoBannerPair";
import { useMerchandisingCms, useMerchandisedProducts, useResolvedCategorySelections, type CategorySelection } from "../../hooks/useMerchandisingCms";
import { mediaPublicUrl } from "./AdminMediaPicker";
import { supabase } from "../../lib/supabaseClient";
import type { Breakpoint } from "./PreviewFrame";
import type { ImagePositionByDevice } from "../../lib/media/imagePosition";

/**
 * Real rendered preview for every Homepage section — reuses the ACTUAL storefront components
 * (VehicleShopSplit/TestimonialCarousel/GetInTouchBox/VehicleBrandGrid/PillTabs/ProductCarousel/
 * CategoryIconStrip/PromoBannerPair), fed either the section's own in-progress DRAFT content or —
 * for sections whose real selections live on a separate merchandising/promotions page — the same
 * live resolution Home.tsx itself uses (never fabricated products just to make the preview look
 * populated; see Documentations MD/delite-cms-visual-editor.md).
 */
export function HomeSectionPreview({
  sectionKey,
  content,
  previewBreakpoint,
}: {
  sectionKey: string;
  content: Record<string, unknown>;
  previewBreakpoint?: Breakpoint;
}) {
  switch (sectionKey) {
    case "vehicle-shop-split":
      return <VehicleShopSplit content={content} />;
    case "testimonials":
      return (
        <div className="py-10 px-6">
          <h2 className="text-2xl heading text-center mb-6">{String(content.title || "Why People Put Trust in Delite Auto")}</h2>
          <TestimonialCarousel items={content.items} />
        </div>
      );
    case "get-in-touch":
      return (
        <div className="p-6">
          <GetInTouchBox content={content} />
        </div>
      );
    case "brands":
      return <BrandsPreview content={content} />;
    case "top-categories-car":
      return <CategoryTabsPreview content={content} tabs={CAR_TABS} />;
    case "top-categories-bike":
      return <CategoryTabsPreview content={content} tabs={BIKE_TABS} />;
    case "trending":
      return <MerchandisedRailPreview content={content} merchKey="trending" tabs={[{ value: "car", labelKey: "carLabel", fallback: "Car" }, { value: "bike", labelKey: "bikeLabel", fallback: "Bike" }]} defaultTitle="Trending on Car & Bike" />;
    case "perfect-vehicle":
      return <MerchandisedRailPreview content={content} merchKey={["featured", "new-arrivals"]} tabs={[{ value: "popular", labelKey: "popularLabel", fallback: "Popular" }, { value: "new", labelKey: "newLabel", fallback: "New" }]} defaultTitle="Find Your Perfect Vehicles" />;
    case "category-strip":
      return <CategoryStripPreview content={content} />;
    case "promo-banners":
      return <PromoBannersPreview content={content} previewBreakpoint={previewBreakpoint} />;
    default:
      return <p className="p-6 text-[13px] text-steel-500">No preview available for this section.</p>;
  }
}

function BrandsPreview({ content }: { content: Record<string, unknown> }) {
  const [tab, setTab] = useState<"car" | "bike">("car");
  const carNames = typeof content.carBrands === "string" ? content.carBrands.split("\n").map((s) => s.trim()).filter(Boolean) : undefined;
  const bikeNames = typeof content.bikeBrands === "string" ? content.bikeBrands.split("\n").map((s) => s.trim()).filter(Boolean) : undefined;
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl heading">{String(content.title || "Shop by Brands")}</h2>
        <PillTabs
          value={tab}
          onChange={(v) => setTab(v as "car" | "bike")}
          options={[
            { value: "car", label: String(content.carLabel || "Car") },
            { value: "bike", label: String(content.bikeLabel || "Bike") },
          ]}
        />
      </div>
      <VehicleBrandGrid vehicle={tab} names={tab === "car" ? carNames : bikeNames} />
    </div>
  );
}

const CAR_TABS = [
  { value: "seat-covers", key: "seatCoversLabel", fallback: "Seat Covers", idsKey: "seatCoversIds" },
  { value: "dash-cams", key: "dashCamsLabel", fallback: "Dash Cams", idsKey: "dashCamsIds" },
  { value: "mats", key: "matsLabel", fallback: "Mats", idsKey: "matsIds" },
  { value: "care", key: "careLabel", fallback: "Care", idsKey: "careIds" },
];
const BIKE_TABS = [
  { value: "helmets", key: "helmetsLabel", fallback: "Helmets", idsKey: "helmetsIds" },
  { value: "covers", key: "coversLabel", fallback: "Covers", idsKey: "coversIds" },
  { value: "saddlebags", key: "saddlebagsLabel", fallback: "Saddlebags", idsKey: "saddlebagsIds" },
  { value: "guards", key: "guardsLabel", fallback: "Guards", idsKey: "guardsIds" },
];

function ProductCatalogUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="p-6 text-center">
      <p className="text-[13px] text-sale font-semibold mb-2">Product catalog unavailable</p>
      <button type="button" onClick={onRetry} className="btn-outline !px-3 !py-1.5 text-[12px]">Retry</button>
    </div>
  );
}

function CategoryTabsPreview({ content, tabs }: { content: Record<string, unknown>; tabs: typeof CAR_TABS }) {
  const [active, setActive] = useState(tabs[0].value);
  const activeTab = tabs.find((t) => t.value === active) ?? tabs[0];
  const ids = Array.isArray(content[activeTab.idsKey]) ? (content[activeTab.idsKey] as unknown[]).filter((id): id is number => Number.isSafeInteger(id)) : [];
  const { products, error, loading } = useMerchandisedProducts(ids);
  const [retryKey, setRetryKey] = useState(0);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl heading">{String(content.title || "Shop by Top Categories")}</h2>
        <span className="text-[12px] font-semibold text-brand-700">{String(content.ctaLabel || "View All")}</span>
      </div>
      <div className="mb-4">
        <PillTabs
          value={active}
          onChange={setActive}
          variant="segmented"
          options={tabs.map((t) => ({ value: t.value, label: String(content[t.key] || t.fallback) }))}
        />
      </div>
      {ids.length === 0 ? (
        <p className="text-[12.5px] text-steel-500">No products selected for this tab yet — pick some above ("{activeTab.fallback} products").</p>
      ) : error ? (
        <ProductCatalogUnavailable key={retryKey} onRetry={() => setRetryKey((k) => k + 1)} />
      ) : loading || products === null ? (
        <p className="text-[12.5px] text-steel-500">Loading products…</p>
      ) : (
        <ProductCarousel products={products} />
      )}
    </div>
  );
}

/** Backs both Trending and Perfect-Vehicle-For-You — same real curated-product resolution
 * Home.tsx uses (via the merchandising CMS, never fabricated), with the same car/bike or
 * popular/new tab toggle. `merchKey` is either one merchandising section key or (for
 * perfect-vehicle) [popularKey, newKey] so each tab reads its own curated id list. */
function MerchandisedRailPreview({
  content,
  merchKey,
  tabs,
  defaultTitle,
}: {
  content: Record<string, unknown>;
  merchKey: string | [string, string];
  tabs: [{ value: string; labelKey: string; fallback: string }, { value: string; labelKey: string; fallback: string }];
  defaultTitle: string;
}) {
  const [active, setActive] = useState(tabs[0].value);
  const { bySectionKey, loading: merchLoading } = useMerchandisingCms();
  const [retryKey, setRetryKey] = useState(0);

  const idsForTab = (tabIndex: 0 | 1): number[] => {
    const key = Array.isArray(merchKey) ? merchKey[tabIndex] : merchKey;
    return (bySectionKey.get(key)?.content.productIds as number[] | undefined) ?? [];
  };
  const ids = idsForTab(active === tabs[0].value ? 0 : 1);
  const { products, error, loading } = useMerchandisedProducts(ids);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl heading">{String(content.title || defaultTitle)}</h2>
        {content.ctaLabel ? <span className="text-[12px] font-semibold text-brand-700">{String(content.ctaLabel)}</span> : null}
      </div>
      <div className="mb-4">
        <PillTabs value={active} onChange={setActive} options={tabs.map((t) => ({ value: t.value, label: String(content[t.labelKey] || t.fallback) }))} />
      </div>
      {merchLoading ? (
        <p className="text-[12.5px] text-steel-500">Loading…</p>
      ) : error ? (
        <ProductCatalogUnavailable key={retryKey} onRetry={() => setRetryKey((k) => k + 1)} />
      ) : ids.length === 0 ? (
        <p className="text-[12.5px] text-steel-500 italic">
          No products curated yet for this tab — pick some on the linked merchandising page.
        </p>
      ) : loading || products === null ? (
        <p className="text-[12.5px] text-steel-500">Loading products…</p>
      ) : (
        <ProductCarousel products={products} />
      )}
    </div>
  );
}

function CategoryStripPreview({ content }: { content: Record<string, unknown> }) {
  const { bySectionKey, loading } = useMerchandisingCms();
  const categorySelections = (bySectionKey.get("categories")?.content.categorySelections as CategorySelection[] | undefined) ?? [];
  const resolved = useResolvedCategorySelections(categorySelections);

  return (
    <div className="p-6">
      {content.title ? <h2 className="text-2xl heading mb-4">{String(content.title)}</h2> : null}
      {loading || resolved === null ? (
        <p className="text-[12.5px] text-steel-500">Loading categories…</p>
      ) : (
        <CategoryIconStrip cmsItems={resolved.length > 0 ? resolved : undefined} />
      )}
    </div>
  );
}

interface PromotionRow {
  id: string;
  heading: string;
  subheading: string | null;
  cta_label: string | null;
  cta_url: string | null;
  image_storage_path: string | null;
  mobile_image_storage_path: string | null;
  image_position: ImagePositionByDevice | null;
  mobile_image_position: ImagePositionByDevice | null;
}

/** Real cms_promotions draft rows (visible to an admin via RLS), mapped to PromoBannerPair's own
 * prop shape and rendered through the REAL component — no more hand-rolled card. */
function PromoBannersPreview({ content, previewBreakpoint }: { content: Record<string, unknown>; previewBreakpoint?: Breakpoint }) {
  const [promotions, setPromotions] = useState<PromotionRow[] | null>(null);
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("cms_promotions")
      .select("id, heading, subheading, cta_label, cta_url, image_storage_path, mobile_image_storage_path, image_position, mobile_image_position")
      .order("display_order", { ascending: true })
      .then(({ data }) => setPromotions((data as PromotionRow[] | null) ?? []));
  }, []);

  return (
    <div className="p-6">
      {content.title ? <h2 className="text-xl heading mb-4">{String(content.title)}</h2> : null}
      {promotions === null ? (
        <p className="text-[12.5px] text-steel-500">Loading promotions…</p>
      ) : promotions.length === 0 ? (
        <p className="text-[12.5px] text-steel-500 italic">No promotions configured yet — add one on the linked Promotions page.</p>
      ) : (
        <PromoBannerPair
          previewBreakpoint={previewBreakpoint}
          promotions={promotions.map((p) => ({
            id: p.id,
            heading: p.heading,
            subheading: p.subheading,
            ctaLabel: p.cta_label,
            ctaUrl: p.cta_url,
            image: p.image_storage_path ? mediaPublicUrl(p.image_storage_path) : null,
            mobileImage: p.mobile_image_storage_path ? mediaPublicUrl(p.mobile_image_storage_path) : null,
            imagePosition: p.image_position,
            mobileImagePosition: p.mobile_image_position,
          }))}
        />
      )}
      <Link to="/admin/website/promotions" className="block mt-3 text-[12px] text-brand-700 hover:underline">Edit promotions →</Link>
    </div>
  );
}
