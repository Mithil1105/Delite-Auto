import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal, X, PackageSearch } from "lucide-react";
import { products } from "../data/products";
import { categories } from "../data/categories";
import { brands } from "../data/brands";
import { ProductCard } from "../components/ProductCard";
import { useCart } from "../context/CartContext";
import { useLang } from "../i18n/LanguageContext";
import clsx from "clsx";

const MAX_PRICE = 70000;
type Sort = "featured" | "price-asc" | "price-desc" | "name";

export default function Shop() {
  const [params, setParams] = useSearchParams();
  const { wishlist } = useCart();
  const { t, dict } = useLang();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const category = params.get("category") ?? "";
  const vehicle = params.get("vehicle") ?? "";
  const brand = params.get("brand") ?? "";
  const q = params.get("q") ?? "";
  const onlyWishlist = params.get("wishlist") === "1";
  const sort = (params.get("sort") as Sort) ?? "featured";
  const maxPrice = Number(params.get("max") ?? MAX_PRICE);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const filtered = useMemo(() => {
    let list = products.filter((p) => p.price <= maxPrice);
    if (category) list = list.filter((p) => p.categorySlug === category);
    if (vehicle) list = list.filter((p) => p.vehicle === vehicle || p.vehicle === "universal");
    if (brand) list = list.filter((p) => p.brandSlug === brand);
    if (onlyWishlist) list = list.filter((p) => wishlist.includes(p.id));
    if (q) {
      const needle = q.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle));
    }
    const sorted = [...list];
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [category, vehicle, brand, q, onlyWishlist, sort, maxPrice, wishlist]);

  const activeCount = [category, vehicle, brand, onlyWishlist ? "w" : ""].filter(Boolean).length;

  const clearAll = () => setParams({}, { replace: true });

  const FiltersPanel = (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="font-display uppercase text-[13px] tracking-widish text-steel-500 mb-3">{t("shop.vehicle")}</h3>
        <div className="flex flex-wrap gap-2">
          {[
            { v: "", label: t("shop.all") },
            { v: "car", label: t("shop.car") },
            { v: "bike", label: t("shop.bike") },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={() => setParam("vehicle", opt.v || null)}
              className={clsx(
                "px-3.5 py-2 text-[12.5px] font-medium uppercase border transition-colors",
                vehicle === opt.v ? "bg-ink text-white border-ink" : "border-line hover:border-ink"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-display uppercase text-[13px] tracking-widish text-steel-500 mb-3">{t("shop.category")}</h3>
        <ul className="space-y-1.5">
          <li>
            <button
              onClick={() => setParam("category", null)}
              className={clsx("text-[13.5px] hover:text-accent transition-colors", !category ? "text-accent font-semibold" : "text-ink/80")}
            >
              {t("shop.allProductsFilter")}
            </button>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <button
                onClick={() => setParam("category", c.slug)}
                className={clsx(
                  "text-[13.5px] hover:text-accent transition-colors",
                  category === c.slug ? "text-accent font-semibold" : "text-ink/80"
                )}
              >
                {dict.categories[c.slug as keyof typeof dict.categories].name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-display uppercase text-[13px] tracking-widish text-steel-500 mb-3">{t("shop.brand")}</h3>
        <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          <li>
            <button
              onClick={() => setParam("brand", null)}
              className={clsx("text-[13.5px] hover:text-accent transition-colors", !brand ? "text-accent font-semibold" : "text-ink/80")}
            >
              {t("shop.allBrands")}
            </button>
          </li>
          {brands.map((b) => (
            <li key={b.slug}>
              <button
                onClick={() => setParam("brand", b.slug)}
                className={clsx(
                  "text-[13.5px] hover:text-accent transition-colors",
                  brand === b.slug ? "text-accent font-semibold" : "text-ink/80"
                )}
              >
                {b.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-display uppercase text-[13px] tracking-widish text-steel-500 mb-3">{t("shop.priceUpTo")}</h3>
        <input
          type="range"
          min={200}
          max={MAX_PRICE}
          step={200}
          value={maxPrice}
          onChange={(e) => setParam("max", e.target.value)}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-[12.5px] text-steel-500 mt-1 font-mono">
          <span>₹200</span>
          <span>₹{maxPrice.toLocaleString("en-IN")}</span>
        </div>
      </div>

      {activeCount > 0 && (
        <button onClick={clearAll} className="btn-ghost !px-0 justify-start text-accent text-[12.5px]">
          <X className="w-3.5 h-3.5" /> {t("shop.clearAll")}
        </button>
      )}
    </div>
  );

  return (
    <div className="container-page py-10">
      <div className="mb-8">
        <span className="eyebrow mb-2">{onlyWishlist ? t("shop.wishlistEyebrow") : t("shop.catalogEyebrow")}</span>
        <h1 className="text-3xl font-semibold">{onlyWishlist ? t("shop.savedItems") : t("shop.allProducts")}</h1>
        {q && <p className="text-steel-500 text-[14px] mt-1">{t("shop.showingResultsFor", { query: q })}</p>}
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-10">
        <aside className="hidden lg:block">{FiltersPanel}</aside>

        <div>
          <div className="flex items-center justify-between mb-6 gap-3">
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden inline-flex items-center gap-2 btn-outline !px-4 !py-2.5"
            >
              <SlidersHorizontal className="w-4 h-4" /> {t("shop.filters")} {activeCount > 0 && `(${activeCount})`}
            </button>
            <span className="text-[13.5px] text-steel-500 hidden sm:block">{t("shop.productsCount", { count: filtered.length })}</span>
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value)}
              className="ml-auto h-10 border border-line px-3 text-[13px] bg-white focus:outline-none focus:border-ink"
            >
              <option value="featured">{t("shop.sortFeatured")}</option>
              <option value="price-asc">{t("shop.sortPriceAsc")}</option>
              <option value="price-desc">{t("shop.sortPriceDesc")}</option>
              <option value="name">{t("shop.sortName")}</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-24 border border-dashed border-line">
              <PackageSearch className="w-10 h-10 text-steel-300 mb-4" />
              <h3 className="font-display uppercase text-lg mb-1">{t("shop.noMatchTitle")}</h3>
              <p className="text-steel-500 text-[14px] mb-5">{t("shop.noMatchDesc")}</p>
              <button onClick={clearAll} className="btn-dark">{t("shop.clearFilters")}</button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-[85%] max-w-sm bg-white p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display uppercase text-lg">{t("shop.filters")}</h2>
              <button onClick={() => setMobileFiltersOpen(false)} aria-label="Close filters">
                <X className="w-5 h-5" />
              </button>
            </div>
            {FiltersPanel}
            <button onClick={() => setMobileFiltersOpen(false)} className="btn-primary w-full mt-8 justify-center">
              {t("shop.showResults", { count: filtered.length })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
