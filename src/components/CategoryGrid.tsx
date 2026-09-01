import { Link } from "react-router-dom";
import { categories } from "../data/categories";
import { ProductArt } from "./ProductArt";
import { useLang } from "../i18n/LanguageContext";

export function CategoryGrid() {
  const { dict } = useLang();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {categories.map((c) => {
        const label = dict.categories[c.slug as keyof typeof dict.categories];
        return (
          <Link
            key={c.slug}
            to={`/shop?category=${c.slug}`}
            className="group relative flex flex-col overflow-hidden border border-line bg-white shadow-card hover:shadow-lift transition-shadow"
          >
            <ProductArt icon={c.icon} categorySlug={c.slug} alt={label.name} className="aspect-square w-full" iconClassName="w-9 h-9" />
            <div className="p-3.5">
              <div className="font-semibold text-[13.5px] leading-snug group-hover:text-accent transition-colors">{label.name}</div>
              <div className="text-[11.5px] text-steel-500 mt-0.5">{label.tagline}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
