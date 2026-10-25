import { useState } from "react";

/**
 * A brand's logo, as stored in Odoo on the brand's category (`cover_image`, served through the
 * `catalog-media` Edge Function — the same field the homepage category images use). Shown on a
 * plain white tile with `object-contain` so square/coloured/transparent logos all sit consistently.
 * Falls back to the brand's initial if the brand has no image or it fails to load. Used by the
 * Brands page and the Deals & Offers brand strip. The parent should be a `group` for the hover zoom.
 */
export function BrandLogo({ name, src, className = "aspect-[4/3] p-4" }: { name: string; src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`grid place-items-center overflow-hidden rounded-xl bg-white ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={`${name} logo`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
        />
      ) : (
        <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-full bg-ink font-display text-xl uppercase text-white">
          {name.slice(0, 1)}
        </span>
      )}
    </div>
  );
}
