import { Link } from "react-router-dom";
import { carModels, type CarModel } from "../../data/carModels";
import { Reveal, staggerDelay } from "../motion/Reveal";

/**
 * Tiles for "Shop by Your Car": one transparent car cut-out per model, linking to that model's
 * accessories page (/cars/:slug). Shared by the home section and the /cars index page. Static
 * data, not Odoo — see src/data/carModels.ts.
 */
export function CarModelGrid({ models = carModels }: { models?: CarModel[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
      {models.map((m, i) => (
        <Reveal key={m.slug} delay={staggerDelay(i, 50, 4)} className="h-full">
          <Link
            to={`/cars/${m.slug}`}
            className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-brand-600 hover:shadow-card motion-reduce:hover:translate-y-0"
          >
            <div className="grid place-items-center aspect-[4/3] bg-gradient-to-b from-steel-50 to-white p-3">
              <img
                src={m.image}
                alt={`${m.make} ${m.name}`}
                loading="lazy"
                decoding="async"
                className="max-h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <div className="px-3 pb-3 pt-1 text-center">
              <div className="text-[10.5px] uppercase tracking-wide text-steel-500">{m.make}</div>
              <div className="text-[13.5px] font-semibold leading-tight">{m.name}</div>
            </div>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}
