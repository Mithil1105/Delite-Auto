import { useState } from "react";
import clsx from "clsx";
import { ProductPlaceholder } from "./ProductPlaceholder";

/**
 * Real product photo renderer — neutral white background, object-contain, no mandatory
 * category gradient/diagonal texture/decorative circles/heavy drop shadow (see ProductArt.tsx
 * for the older decorative version this replaces on product cards). Falls back to
 * ProductPlaceholder when no src is given or the image fails to load.
 *
 * Deliberately does NOT resolve productImages/categoryImages itself — the caller passes `src`,
 * so a caller that wants ProductArt's "never borrow the category photo for a specific product"
 * rule (or PDP's "fall back to the category photo" rule) stays in control of which lookup it uses.
 */
export function ProductMedia({
  src,
  alt,
  icon,
  className = "",
  iconClassName,
  eager = false,
}: {
  src?: string;
  alt: string;
  icon: string;
  className?: string;
  iconClassName?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = !!src && !failed;

  return (
    <div className={clsx("relative overflow-hidden bg-white", className)}>
      {showImage ? (
        <>
          {!loaded && <div className="absolute inset-0 animate-pulse bg-steel-50" aria-hidden />}
          <img
            src={src}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={clsx(
              "relative w-full h-full object-contain transition-opacity duration-200",
              loaded ? "opacity-100" : "opacity-0"
            )}
          />
        </>
      ) : (
        <ProductPlaceholder icon={icon} className="absolute inset-0" iconClassName={iconClassName} />
      )}
    </div>
  );
}
