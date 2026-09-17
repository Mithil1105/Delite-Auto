import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { brands as mockBrands } from "../data/brands";
import { products as fallbackProducts } from "../data/products";
import type { Category } from "../data/types";
import { catalogService } from "../services/catalog/catalogService";
import { useCatalogProducts } from "../hooks/useCatalogProducts";
import { useLang } from "../i18n/LanguageContext";

// Real Odoo data via Supabase — the "Brand" product.attribute (id 9) exists but is unused; real
// brands are verified brand-named product.public.category entries instead. See
// Documentations MD/odoo-real-catalog.md.
const IS_REAL_CATALOG = import.meta.env.VITE_CATALOG_SOURCE === "supabase";

function useBrandCategories() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  useEffect(() => {
    if (!IS_REAL_CATALOG) return;
    let cancelled = false;
    catalogService.getCategories().then((c) => {
      if (!cancelled) setCategories(c.filter((cat) => cat.role === "brand"));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return categories;
}

export default function Brands() {
  const { t, dict } = useLang();
  const realBrands = useBrandCategories();
  // Mock-catalog-only: real brand counts come from the server (`catalog-categories`), never
  // recomputed client-side against the whole catalog — see Documentations MD/odoo-real-catalog.md,
  // "Brands page".
  const mockCatalogProducts = useCatalogProducts() ?? fallbackProducts;

  return (
    <div className="container-page py-14">
      <div className="max-w-2xl mb-12">
        <span className="eyebrow mb-3">{dict.brands.eyebrow}</span>
        <h1 className="text-4xl font-semibold mb-4">{dict.brands.title}</h1>
        <p className="text-steel-500 text-[15px] leading-relaxed">{dict.brands.desc}</p>
      </div>

      {IS_REAL_CATALOG ? (
        realBrands === null ? (
          <p className="text-steel-500 text-[14px]">{t("shop.loadingCatalog")}</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {realBrands.map((b) => {
              const count = b.productCount ?? 0;
              return (
                <Link
                  key={b.odooId}
                  to={`/shop?brand=${b.odooId}`}
                  className="group card-surface p-6 flex flex-col justify-between hover:shadow-lift transition-shadow"
                >
                  <div>
                    <h2 className="font-display uppercase text-xl mb-1.5 group-hover:text-accent transition-colors">{b.name}</h2>
                  </div>
                  <div className="flex items-center justify-between mt-6 pt-4 border-t border-line">
                    <span className="font-mono text-[12px] text-steel-500">
                      {count === 1 ? t("brands.productCount", { count }) : t("brands.productsCount", { count })}
                    </span>
                    <ArrowRight className="w-4 h-4 text-ink/40 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              );
            })}
          </div>
        )
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {mockBrands.map((b) => {
            const count = mockCatalogProducts.filter((p) => p.brandSlug === b.slug).length;
            const blurb = dict.brandBlurbs[b.slug as keyof typeof dict.brandBlurbs] ?? b.blurb;
            return (
              <Link
                key={b.slug}
                to={`/shop?brand=${b.slug}`}
                className="group card-surface p-6 flex flex-col justify-between hover:shadow-lift transition-shadow"
              >
                <div>
                  <h2 className="font-display uppercase text-xl mb-1.5 group-hover:text-accent transition-colors">{b.name}</h2>
                  <p className="text-[13.5px] text-steel-500 leading-relaxed">{blurb}</p>
                </div>
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-line">
                  <span className="font-mono text-[12px] text-steel-500">
                    {count === 1 ? t("brands.productCount", { count }) : t("brands.productsCount", { count })}
                  </span>
                  <ArrowRight className="w-4 h-4 text-ink/40 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
