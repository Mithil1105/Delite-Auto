import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, PackageSearch, SlidersHorizontal, X } from "lucide-react";
import { products } from "../data/products";
import { categories } from "../data/categories";
import { brands } from "../data/brands";
import { ProductCard } from "../components/product/ProductCard";
import { TrustBadgesRow } from "../components/home/TrustBadgesRow";
import { useCart } from "../context/CartContext";
import { useLang } from "../i18n/LanguageContext";
import clsx from "clsx";

const MAX_PRICE = 70000;
const PAGE_SIZE = 9;
type Sort = "relevance" | "price-asc" | "price-desc" | "name";

/**
 * A collapsible filter group — "Category type" / "Brands" / "Model name" / "Availability" /
 * "Price" / "Colors" in the Figma sidebar all render this way, each collapsed by default.
 */
function FilterSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line py-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-left">
        <span className="text-[13.5px] font-semibold">{title}</span>
        <ChevronDown className={clsx("w-4 h-4 text-steel-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const { wishlist } = useCart();
  const { t, dict } = useLang();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [page, setPage] = useState(1);

  const category = params.get("category") ?? "";
  const vehicle = params.get("vehicle") ?? "";
  const brand = params.get("brand") ?? "";
  const model = params.get("model") ?? "";
  const q = params.get("q") ?? "";
  const onlyWishlist = params.get("wishlist") === "1";
  const availabilityParam = params.get("availability") ?? ""; // "in" | "out" | ""
  const color = params.get("color") ?? "";
  const sort = (params.get("sort") as Sort) ?? "relevance";
  const maxPrice = Number(params.get("max") ?? MAX_PRICE);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const swatches = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.colors?.forEach((c) => set.add(c)));
    return Array.from(set).slice(0, 12);
  }, []);

  const filtered = useMemo(() => {
    let list = products.filter((p) => p.price <= maxPrice);
    if (category) list = list.filter((p) => p.categorySlug === category);
    if (vehicle) list = list.filter((p) => p.vehicle === vehicle || p.vehicle === "universal");
    if (brand) list = list.filter((p) => p.brandSlug === brand);
    if (model) list = list.filter((p) => p.name.toLowerCase().includes(model.toLowerCase()));
    if (onlyWishlist) list = list.filter((p) => wishlist.includes(p.id));
    if (availabilityParam === "in") list = list.filter((p) => p.available !== false);
    if (availabilityParam === "out") list = list.filter((p) => p.available === false);
    if (color) list = list.filter((p) => p.colors?.includes(color));
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle));
    }
    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [category, vehicle, brand, model, q, onlyWishlist, availabilityParam, color, sort, maxPrice, wishlist]);

  const activeCount = [category, vehicle, brand, model, availabilityParam, color, onlyWishlist ? "w" : ""].filter(Boolean).length;
  const clearAll = () => {
    setParams({}, { replace: true });
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const desktopSlice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const mobileSlice = filtered.slice(0, page * PAGE_SIZE);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    return [1, 2, 3, "…", totalPages] as const;
  }, [totalPages]);

  const categoryLabel = category ? dict.categories[category as keyof typeof dict.categories]?.name : null;

  const FiltersPanel = (
    <div>
      <FilterSection title={t("shop.categoryType")} defaultOpen>
        <ul className="space-y-2">
          <li>
            <button
              onClick={() => setParam("category", null)}
              className={clsx("text-[13.5px] hover:text-brand-700 transition-colors", !category ? "text-brand-700 font-semibold" : "text-ink/80")}
            >
              {t("shop.allProductsFilter")}
            </button>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <button
                onClick={() => setParam("category", c.slug)}
                className={clsx("text-[13.5px] hover:text-brand-700 transition-colors", category === c.slug ? "text-brand-700 font-semibold" : "text-ink/80")}
              >
                {dict.categories[c.slug as keyof typeof dict.categories].name}
              </button>
            </li>
          ))}
        </ul>
      </FilterSection>

      <FilterSection title={t("shop.brand")}>
        <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
          <li>
            <button
              onClick={() => setParam("brand", null)}
              className={clsx("text-[13.5px] hover:text-brand-700 transition-colors", !brand ? "text-brand-700 font-semibold" : "text-ink/80")}
            >
              {t("shop.allBrands")}
            </button>
          </li>
          {brands.map((b) => (
            <li key={b.slug}>
              <button
                onClick={() => setParam("brand", b.slug)}
                className={clsx("text-[13.5px] hover:text-brand-700 transition-colors", brand === b.slug ? "text-brand-700 font-semibold" : "text-ink/80")}
              >
                {b.name}
              </button>
            </li>
          ))}
        </ul>
      </FilterSection>

      <FilterSection title={t("shop.modelName")}>
        <input
          type="text"
          value={model}
          onChange={(e) => setParam("model", e.target.value || null)}
          placeholder={t("shop.modelNamePlaceholder")}
          className="w-full h-10 border border-line px-3 text-[13px] bg-white focus:outline-none focus:border-brand-500"
        />
      </FilterSection>

      <FilterSection title={t("shop.availability")}>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[13.5px] cursor-pointer">
            <input type="checkbox" checked={availabilityParam === "in"} onChange={(e) => setParam("availability", e.target.checked ? "in" : null)} />
            {t("shop.inStock")}
          </label>
          <label className="flex items-center gap-2 text-[13.5px] cursor-pointer">
            <input type="checkbox" checked={availabilityParam === "out"} onChange={(e) => setParam("availability", e.target.checked ? "out" : null)} />
            {t("shop.outOfStock")}
          </label>
        </div>
      </FilterSection>

      <FilterSection title={t("shop.priceUpTo")}>
        <input
          type="range"
          min={200}
          max={MAX_PRICE}
          step={200}
          value={maxPrice}
          onChange={(e) => setParam("max", e.target.value)}
          className="w-full accent-brand-500"
        />
        <div className="flex justify-between text-[12.5px] text-steel-500 mt-1 font-mono">
          <span>₹200</span>
          <span>₹{maxPrice.toLocaleString("en-IN")}</span>
        </div>
      </FilterSection>

      <FilterSection title={t("shop.colorsLabel")}>
        <div className="flex flex-wrap gap-2">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={c}
              onClick={() => setParam("color", color === c ? null : c)}
              className={clsx("w-6 h-6 rounded-full border-2 transition-transform", color === c ? "border-brand-500 scale-110" : "border-line")}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </FilterSection>

      {activeCount > 0 && (
        <button onClick={clearAll} className="btn-pill-outline !px-4 !py-2 mt-4 text-[12.5px]">
          <X className="w-3.5 h-3.5" /> {t("shop.clearAll")}
        </button>
      )}
    </div>
  );

  return (
    <div className="bg-white">
      <div className="container-page py-8">
        <nav className="flex items-center gap-1.5 text-[12.5px] text-steel-500 mb-6">
          <Link to="/" className="hover:text-ink">{t("shop.breadcrumbHome")}</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-ink">{categoryLabel ?? t("shop.shopAllTitle")}</span>
        </nav>

        <h1 className="text-center text-2xl sm:text-3xl font-display uppercase mb-6">
          {onlyWishlist ? t("shop.savedItems") : categoryLabel ?? t("shop.shopAllTitle")}
        </h1>
        {q && <p className="text-center text-steel-500 text-[14px] -mt-4 mb-6">{t("shop.showingResultsFor", { query: q })}</p>}

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <span className="text-[13.5px] text-steel-500">{t("shop.productsCount", { count: filtered.length })}</span>

          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="lg:hidden inline-flex items-center gap-2 btn-pill-outline !px-4 !py-2 ml-auto"
          >
            <SlidersHorizontal className="w-4 h-4" /> {t("shop.filterToggle")} {activeCount > 0 && `(${activeCount})`}
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="hidden lg:inline-flex items-center gap-2 btn-pill-outline !px-4 !py-2 ml-auto"
          >
            <SlidersHorizontal className="w-4 h-4" /> {t("shop.filterToggle")} {activeCount > 0 && `(${activeCount})`}
          </button>

          <select
            value={sort}
            onChange={(e) => setParam("sort", e.target.value)}
            className="h-10 border border-line px-3 text-[13px] bg-white focus:outline-none focus:border-brand-500"
            aria-label={t("shop.sortByLabel")}
          >
            <option value="relevance">{t("shop.sortByLabel")}: {t("shop.sortRelevance")}</option>
            <option value="price-asc">{t("shop.sortPriceAsc")}</option>
            <option value="price-desc">{t("shop.sortPriceDesc")}</option>
            <option value="name">{t("shop.sortName")}</option>
          </select>
        </div>

        <div className={clsx("grid gap-10", sidebarOpen ? "lg:grid-cols-[220px_1fr]" : "lg:grid-cols-1")}>
          {sidebarOpen && (
            <aside className="hidden lg:block">
              <h2 className="font-display uppercase text-[13px] tracking-widish mb-1">{t("shop.filtersHeading")}</h2>
              {FiltersPanel}
            </aside>
          )}

          <div>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-24 border border-dashed border-line">
                <PackageSearch className="w-10 h-10 text-steel-300 mb-4" />
                <h3 className="font-display uppercase text-lg mb-1">{t("shop.noMatchTitle")}</h3>
                <p className="text-steel-500 text-[14px] mb-5">{t("shop.noMatchDesc")}</p>
                <button onClick={clearAll} className="btn-pill-dark">{t("shop.clearFilters")}</button>
              </div>
            ) : (
              <>
                {/* Desktop: true pagination */}
                <div className={clsx("hidden lg:grid gap-5", sidebarOpen ? "lg:grid-cols-3" : "lg:grid-cols-4")}>
                  {desktopSlice.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="hidden lg:flex items-center justify-center gap-2 mt-10">
                    <button
                      onClick={() => setPage((n) => Math.max(1, n - 1))}
                      disabled={page === 1}
                      className="px-3 py-2 text-[13px] font-medium disabled:opacity-40 hover:text-brand-700"
                    >
                      {t("shop.paginationPrev")}
                    </button>
                    {pageNumbers.map((n, i) =>
                      n === "…" ? (
                        <span key={`ellipsis-${i}`} className="px-2 text-steel-500">
                          …
                        </span>
                      ) : (
                        <button
                          key={n}
                          onClick={() => setPage(n as number)}
                          className={clsx(
                            "w-9 h-9 grid place-items-center rounded-full text-[13px] font-medium transition-colors",
                            page === n ? "bg-brand-500 text-white" : "hover:bg-steel-50"
                          )}
                        >
                          {n}
                        </button>
                      )
                    )}
                    <button
                      onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-2 text-[13px] font-medium disabled:opacity-40 hover:text-brand-700"
                    >
                      {t("shop.paginationNext")}
                    </button>
                  </div>
                )}

                {/* Mobile: single column + Load More */}
                <div className="grid lg:hidden grid-cols-1 gap-5">
                  {mobileSlice.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
                {mobileSlice.length < filtered.length && (
                  <div className="lg:hidden flex justify-center mt-8">
                    <button onClick={() => setPage((n) => n + 1)} className="btn-pill-outline">
                      {t("shop.loadMore")}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="mt-16 pt-10 border-t border-line">
          <TrustBadgesRow />
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-[85%] max-w-sm bg-white p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display uppercase text-lg">{t("shop.filtersHeading")}</h2>
              <button onClick={() => setMobileFiltersOpen(false)} aria-label="Close filters">
                <X className="w-5 h-5" />
              </button>
            </div>
            {FiltersPanel}
            <button onClick={() => setMobileFiltersOpen(false)} className="btn-pill-dark w-full mt-6 justify-center">
              {t("shop.showResults", { count: filtered.length })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
