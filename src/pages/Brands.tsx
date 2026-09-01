import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { brands } from "../data/brands";
import { productsByBrand } from "../data/products";
import { useLang } from "../i18n/LanguageContext";

export default function Brands() {
  const { t, dict } = useLang();

  return (
    <div className="container-page py-14">
      <div className="max-w-2xl mb-12">
        <span className="eyebrow mb-3">{dict.brands.eyebrow}</span>
        <h1 className="text-4xl font-semibold mb-4">{dict.brands.title}</h1>
        <p className="text-steel-500 text-[15px] leading-relaxed">{dict.brands.desc}</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {brands.map((b) => {
          const count = productsByBrand(b.slug).length;
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
    </div>
  );
}
