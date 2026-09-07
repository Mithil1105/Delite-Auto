import { vehicleBrandsFor } from "../../data/vehicleBrands";

/**
 * OEM car/bike wordmark badges for "Shop by Brands" — a stylized text-badge treatment
 * (matching BrandMarquee's approach for accessory brands) since we have no licensed
 * logo assets to drop in. See Documentations MD/figma-homepage-redesign.md.
 */
export function VehicleBrandGrid({ vehicle }: { vehicle: "car" | "bike" }) {
  const list = vehicleBrandsFor(vehicle);
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3">
      {list.map((b) => (
        <div
          key={b.slug}
          className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl border border-line bg-white hover:border-brand-600 hover:shadow-card transition-all p-2"
        >
          <span className="grid place-items-center w-9 h-9 rounded-full bg-ink text-white font-display text-[13px] uppercase">
            {b.name.slice(0, 1)}
          </span>
          <span className="text-[10.5px] text-center leading-tight text-steel-700">{b.name}</span>
        </div>
      ))}
    </div>
  );
}
