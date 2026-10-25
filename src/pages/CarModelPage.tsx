import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PackageSearch, TriangleAlert, X } from "lucide-react";
import { carModelBySlug, type CarModel } from "../data/carModels";
import type { Product } from "../data/types";
import { catalogService } from "../services/catalog/catalogService";
import { ProductCard } from "../components/product/ProductCard";
import { SeoHead } from "../components/SeoHead";
import { Reveal, staggerDelay } from "../components/motion/Reveal";
import { Chip, ChipGroup, FilterCard, FilterGroup, ListingToolbar, Segmented, SortSelect, ViewToggle } from "../components/listing/ListingKit";
import { bandContains, buildPriceBands } from "../lib/listing/priceBands";
import { useLang } from "../i18n/LanguageContext";

const PAGE_SIZE = 60; // catalog-products' maximum
const MAX_PAGES = 5;

type LoadState = { status: "loading" | "ready" | "error"; items: Product[] };
type SortMode = "relevance" | "price-asc" | "price-desc" | "name";

/**
 * Products whose Odoo name mentions the model. Odoo has no per-car fitment data (see
 * src/data/carModels.ts), so this is name matching: a server-side name search for `model.query`,
 * then `model.match` on each name to drop incidental substring hits. Every brand's products come
 * back together; the filters on the page then narrow them client-side.
 */
function useModelProducts(model: CarModel | undefined) {
  const [state, setState] = useState<LoadState>({ status: "loading", items: [] });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    setState({ status: "loading", items: [] });
    (async () => {
      try {
        const all: Product[] = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages && page <= MAX_PAGES) {
          const result = await catalogService.getProductsPage({ page, pageSize: PAGE_SIZE, q: model.query });
          totalPages = result.totalPages;
          all.push(...result.items);
          page++;
        }
        const seen = new Set<string>();
        // Bike-only products can't be car accessories (e.g. a bicycle lock that happens to be named "Creta").
        const forCars = (p: Product) => !p.vehicleTypes || p.vehicleTypes.length === 0 || p.vehicleTypes.includes("car");
        const items = all.filter((p) => model.match.test(p.name) && forCars(p) && !seen.has(p.id) && seen.add(p.id));
        if (!cancelled) setState({ status: "ready", items });
      } catch {
        if (!cancelled) setState({ status: "error", items: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [model, reload]);

  return { ...state, retry: () => setReload((n) => n + 1) };
}

const brandOf = (p: Product) => p.brand?.name ?? "Other";

/** /cars/:slug — remounts per car (key), so every car starts with clean filters. */
export default function CarModelPage() {
  const { slug } = useParams();
  return <CarModelPageInner key={slug} slug={slug} />;
}

/** Accessories from every brand for one car model, with the same filters / sort / view as the shop. */
function CarModelPageInner({ slug }: { slug?: string }) {
  const model = carModelBySlug(slug);
  const { t } = useLang();
  const { status, items, retry } = useModelProducts(model);

  const [brand, setBrand] = useState("");
  const [availability, setAvailability] = useState<"" | "in" | "out">("");
  const [bandKey, setBandKey] = useState("any");
  const [sort, setSort] = useState<SortMode>("relevance");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (model) document.title = `${model.make} ${model.name} accessories — Delite Auto Accessories`;
  }, [model]);

  const bands = useMemo(() => buildPriceBands(t), [t]);

  const brandItems = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of items) counts.set(brandOf(p), (counts.get(brandOf(p)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ value: name, label: name, count }));
  }, [items]);

  const visible = useMemo(() => {
    const band = bands.find((b) => b.key === bandKey) ?? bands[0];
    const list = items.filter(
      (p) =>
        (!brand || brandOf(p) === brand) &&
        bandContains(band, p.price) &&
        (availability === "" || (availability === "in" ? p.purchasable !== false : p.purchasable === false))
    );
    if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
    else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [items, bands, bandKey, brand, availability, sort]);

  if (!model) return <Navigate to="/cars" replace />;

  const activeCount = [brand, availability, bandKey !== "any" ? bandKey : ""].filter(Boolean).length;
  const resetAll = () => {
    setBrand("");
    setAvailability("");
    setBandKey("any");
  };
  const canReset = activeCount > 0;

  const FiltersPanel = (
    <>
      {brandItems.length > 1 && (
        <FilterGroup title={t("shop.brand")}>
          <ChipGroup allLabel={t("shop.allBrands")} selected={brand} onSelect={setBrand} items={brandItems} limit={10} showMoreLabel={t("shop.showMore")} showLessLabel={t("shop.showLess")} />
        </FilterGroup>
      )}
      <FilterGroup title={t("shop.availability")}>
        <Segmented
          label={t("shop.availability")}
          value={availability}
          onChange={(v) => setAvailability(v === availability ? "" : (v as "in" | "out"))}
          options={[
            { value: "in", label: t("shop.inStock") },
            { value: "out", label: t("shop.outOfStock") },
          ]}
        />
      </FilterGroup>
      <FilterGroup title={t("shop.priceRange")}>
        <div className="flex flex-wrap gap-2">
          {bands.map((b) => (
            <Chip key={b.key} selected={bandKey === b.key} onClick={() => setBandKey(b.key)}>
              {b.label}
            </Chip>
          ))}
        </div>
      </FilterGroup>
    </>
  );

  return (
    <div className="bg-white">
      <SeoHead routeKey="cars" />
      <div className="container-page py-6 sm:py-8">
        <nav className="text-[12.5px] text-steel-500 mb-4">
          <Link to="/" className="hover:underline">{t("carModels.home")}</Link> /{" "}
          <Link to="/cars" className="hover:underline">{t("carModels.indexTitle")}</Link> /{" "}
          <span className="text-ink">{model.make} {model.name}</span>
        </nav>

        <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8 rounded-2xl border border-line bg-gradient-to-b from-steel-50 to-white p-5 sm:p-6 mb-5">
          <img src={model.image} alt={`${model.make} ${model.name}`} className="w-full max-w-[220px] sm:max-w-[280px] object-contain" />
          <div>
            <div className="text-[11px] uppercase tracking-wide text-steel-500">{model.make}</div>
            <h1 className="text-3xl sm:text-4xl heading mb-2">{t("carModels.accessoriesFor").replace("{car}", model.name)}</h1>
            {status === "ready" && items.length > 0 && (
              <p className="text-[14px] text-steel-500">
                {items.length === 1 ? t("carModels.summaryOne") : t("carModels.summary").replace("{count}", String(items.length)).replace("{brands}", String(brandItems.length))}
              </p>
            )}
          </div>
        </div>

        {status === "loading" && <p className="py-16 text-center text-[14px] text-steel-500">{t("shop.loadingCatalog")}</p>}

        {status === "error" && (
          <div className="py-16 flex flex-col items-center text-center">
            <TriangleAlert className="w-10 h-10 text-steel-300 mb-4" />
            <h2 className="font-display uppercase text-xl mb-2">{t("shop.catalogUnavailableTitle")}</h2>
            <p className="text-steel-500 text-[14px] mb-6 max-w-[40ch]">{t("shop.catalogUnavailableDesc")}</p>
            <button onClick={retry} className="btn-dark">{t("shop.retry")}</button>
          </div>
        )}

        {status === "ready" && items.length === 0 && (
          <div className="py-16 flex flex-col items-center text-center">
            <PackageSearch className="w-10 h-10 text-steel-300 mb-4" />
            <h2 className="font-display uppercase text-xl mb-2">{t("carModels.emptyTitle").replace("{car}", model.name)}</h2>
            <p className="text-steel-500 text-[14px] mb-6 max-w-[48ch]">{t("carModels.emptyDesc")}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/shop?vehicle=car" className="btn-dark">{t("carModels.browseAllCar")}</Link>
              <Link to="/contact" className="btn-outline">{t("carModels.askUs")}</Link>
            </div>
          </div>
        )}

        {status === "ready" && items.length > 0 && (
          <>
            <div className={sidebarOpen ? "grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start" : "grid gap-6 lg:grid-cols-1"}>
              {sidebarOpen && (
                <aside className="hidden lg:block lg:sticky lg:top-[calc(var(--header-height,110px)+16px)]">
                  <FilterCard
                    title={t("shop.filtersHeading")}
                    resetLabel={t("shop.resetAll")}
                    onReset={canReset ? resetAll : undefined}
                    closeLabel={t("shop.hideFilters")}
                    onClose={() => setSidebarOpen(false)}
                  >
                    {FiltersPanel}
                  </FilterCard>
                </aside>
              )}

              <div className="min-w-0">
                <ListingToolbar
                  title={<h2 className="text-xl sm:text-2xl font-semibold" aria-live="polite">{t("shop.productsCount", { count: visible.length })}</h2>}
                  filtersLabel={t("shop.filterToggle")}
                  activeCount={activeCount}
                  sidebarOpen={sidebarOpen}
                  onToggleSidebar={() => setSidebarOpen((o) => !o)}
                  onOpenDrawer={() => setFiltersOpen(true)}
                  sortSlot={
                    <SortSelect
                      className="w-full sm:w-auto"
                      label={t("shop.sortByLabel")}
                      value={sort}
                      onChange={(v) => setSort(v as SortMode)}
                      options={[
                        { value: "relevance", label: t("shop.sortRelevance") },
                        { value: "price-asc", label: t("shop.sortPriceAsc") },
                        { value: "price-desc", label: t("shop.sortPriceDesc") },
                        { value: "name", label: t("shop.sortName") },
                      ]}
                    />
                  }
                  viewSlot={<ViewToggle value={view} onChange={setView} gridLabel={t("shop.viewGrid")} listLabel={t("shop.viewList")} />}
                />

                {visible.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-20 border border-dashed border-line rounded-2xl">
                    <PackageSearch className="w-10 h-10 text-steel-300 mb-4" />
                    <h3 className="font-display uppercase text-lg mb-1">{t("shop.noMatchTitle")}</h3>
                    <p className="text-steel-500 text-[14px] mb-5">{t("shop.noMatchDesc")}</p>
                    <button type="button" onClick={resetAll} className="btn-pill-dark">{t("shop.clearFilters")}</button>
                  </div>
                ) : (
                  <div className={view === "list" ? "grid grid-cols-1 gap-4" : sidebarOpen ? "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3" : "grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4"}>
                    {visible.map((p, i) => (
                      <Reveal key={p.id} delay={staggerDelay(i, 55, 3)} className="h-full">
                        <ProductCard product={p} layout={view} className="h-full" />
                      </Reveal>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {filtersOpen && (
              <div className="fixed inset-0 z-[90] lg:hidden">
                <div className="absolute inset-0 bg-ink/50" onClick={() => setFiltersOpen(false)} />
                <div className="absolute right-0 top-0 bottom-0 w-[85%] max-w-sm bg-white p-6 overflow-y-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display uppercase text-lg">{t("shop.filtersHeading")}</h2>
                    <button onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="divide-y divide-line rounded-2xl border border-line">{FiltersPanel}</div>
                  {canReset && (
                    <button type="button" onClick={resetAll} className="mt-4 text-[13px] font-medium underline underline-offset-2 hover:text-brand-700">
                      {t("shop.resetAll")}
                    </button>
                  )}
                  <button onClick={() => setFiltersOpen(false)} className="btn-pill-dark w-full mt-6 justify-center">
                    {t("shop.showResults", { count: visible.length })}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
