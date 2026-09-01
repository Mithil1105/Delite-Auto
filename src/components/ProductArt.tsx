import { useState } from "react";
import { Icon } from "../lib/icons";
import { categoryGradient } from "../lib/categoryTheme";
import { productImages } from "../lib/productImages";
import { categoryImages } from "../lib/categoryImages";

export function ProductArt({
  icon,
  categorySlug,
  productId,
  alt = "",
  className = "",
  iconClassName = "w-10 h-10",
}: {
  icon: string;
  categorySlug: string;
  productId?: string;
  alt?: string;
  className?: string;
  iconClassName?: string;
}) {
  // A specific product falls back to icon art when it has no matched photo — it must
  // NOT silently borrow the category's representative photo, which would make two
  // unrelated products appear identical. The category image only applies when this
  // component is used for a category tile (no productId passed at all).
  const resolvedImage = productId ? productImages[productId] : categoryImages[categorySlug];
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = resolvedImage && !imageFailed;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-diagonal-lines ${className}`}
      style={{ backgroundImage: `${categoryGradient(categorySlug)}` }}
    >
      <div className="absolute inset-0 bg-diagonal-lines opacity-60" aria-hidden />
      <div className="absolute -right-6 -bottom-8 w-28 h-28 rounded-full bg-white/[0.06]" aria-hidden />
      <div className="absolute -left-8 -top-8 w-20 h-20 rounded-full bg-white/[0.05]" aria-hidden />
      {showImage ? (
        <img
          src={resolvedImage}
          alt={alt}
          loading="lazy"
          onError={() => setImageFailed(true)}
          className="relative w-full h-full object-contain p-[8%] drop-shadow-[0_12px_16px_rgba(0,0,0,0.35)]"
        />
      ) : (
        <Icon name={icon} className={`relative text-white/90 ${iconClassName}`} strokeWidth={1.4} />
      )}
    </div>
  );
}
