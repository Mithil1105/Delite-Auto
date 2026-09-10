import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus } from "lucide-react";
import clsx from "clsx";
import type { Product } from "../../data/types";
import { ProductMedia } from "../product/ProductMedia";
import { productImages } from "../../lib/productImages";
import { formatINR } from "../../lib/format";
import { brandBySlug } from "../../data/brands";
import { useCart } from "../../context/CartContext";
import { useLang } from "../../i18n/LanguageContext";

/**
 * One cart-drawer line. The metadata row (brand today) is deliberately its own block, separate
 * from name/price/qty — colour/vehicle/model/year/fitment (once the Product model carries them)
 * slot in there without touching the rest of the layout. See
 * Documentations MD/responsive-cart-drawer.md.
 */
export const CartDrawerItem = forwardRef<HTMLDivElement, { product: Product; qty: number; highlighted?: boolean }>(
  function CartDrawerItem({ product, qty, highlighted = false }, ref) {
    const { setQuantity, removeLine } = useCart();
    const { t } = useLang();
    const brand = brandBySlug(product.brandSlug);

    return (
      <div
        ref={ref}
        className={clsx("flex gap-3 py-4 px-5 transition-colors", highlighted && "animate-cartHighlight motion-reduce:animate-none")}
      >
        <Link to={`/product/${product.slug}`} className="shrink-0">
          <ProductMedia src={productImages[product.id]} alt={product.name} icon={product.icon} className="w-20 h-20 rounded-xl border border-line" iconClassName="w-7 h-7" />
        </Link>
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Metadata row — brand today; colour/vehicle/model/fitment land here later without a
              layout change. */}
          {brand && <span className="font-mono text-[10.5px] uppercase tracking-widish text-steel-500">{brand.name}</span>}
          <Link to={`/product/${product.slug}`} className="font-semibold text-[13.5px] leading-snug hover:text-brand-700 transition-colors line-clamp-2">
            {product.name}
          </Link>

          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center border border-line rounded-md w-fit">
                <button
                  type="button"
                  onClick={() => setQuantity(product.id, qty - 1)}
                  className="w-7 h-7 grid place-items-center hover:bg-steel-50"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="w-6 text-center font-mono text-[12.5px]">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(product.id, qty + 1)}
                  className="w-7 h-7 grid place-items-center hover:bg-steel-50"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <button type="button" onClick={() => removeLine(product.id)} className="text-[11.5px] font-medium text-steel-500 hover:text-sale transition-colors text-left">
                {t("cart.remove")}
              </button>
            </div>
            <span className="price text-[14px] font-semibold shrink-0">{formatINR(product.price * qty)}</span>
          </div>
        </div>
      </div>
    );
  }
);
