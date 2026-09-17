import { Link } from "react-router-dom";
import { Minus, Plus, Trash2, ArrowRight, ShoppingBag } from "lucide-react";
import { useCart } from "../context/CartContext";
import { ProductMedia } from "../components/product/ProductMedia";
import { productImages } from "../lib/productImages";
import { formatINR } from "../lib/format";
import { brandBySlug } from "../data/brands";
import { useLang } from "../i18n/LanguageContext";

export default function Cart() {
  const { lines, removeLine, setQuantity } = useCart();
  const { t } = useLang();

  const subtotal = lines.reduce((sum, l) => sum + (l.variantPrice ?? l.product.price) * l.qty, 0);

  if (lines.length === 0) {
    return (
      <div className="container-page py-24 flex flex-col items-center text-center">
        <ShoppingBag className="w-12 h-12 text-steel-300 mb-5" />
        <h1 className="text-2xl font-semibold mb-2">{t("cart.empty")}</h1>
        <p className="text-steel-500 text-[14.5px] mb-6 max-w-[40ch]">{t("cart.emptyDesc")}</p>
        <Link to="/shop" className="btn-dark">{t("cart.browseCatalog")}</Link>
      </div>
    );
  }

  return (
    <div className="container-page py-12">
      <h1 className="text-3xl font-semibold mb-8">{t("cart.title")}</h1>
      <div className="grid lg:grid-cols-[1fr_340px] gap-10">
        <div className="flex flex-col divide-y divide-line border-y border-line">
          {lines.map(({ product, qty, variantId, variantLabel, variantPrice }) => {
            const brand = brandBySlug(product.brandSlug);
            const brandName = brand?.name ?? product.brand?.name;
            const unitPrice = variantPrice ?? product.price;
            return (
              <div key={variantId ? `${product.id}-${variantId}` : product.id} className="flex gap-4 py-5">
                <Link to={`/product/${product.slug}`} className="shrink-0">
                  <ProductMedia src={product.primaryImage ?? productImages[product.id]} alt={product.name} icon={product.icon} className="w-24 h-24" iconClassName="w-8 h-8" />
                </Link>
                <div className="flex-1 min-w-0 flex flex-col">
                  {brandName && <span className="font-mono text-[11px] uppercase tracking-widish text-steel-500">{brandName}</span>}
                  <Link to={`/product/${product.slug}`} className="font-semibold text-[14.5px] leading-snug hover:text-accent transition-colors truncate">
                    {product.name}
                  </Link>
                  {variantLabel && <span className="text-[12px] text-steel-500">{variantLabel}</span>}
                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex items-center border border-line">
                      <button onClick={() => setQuantity(product.id, qty - 1, variantId)} className="w-8 h-8 grid place-items-center hover:bg-steel-50" aria-label="Decrease">
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center font-mono text-[13px]">{qty}</span>
                      <button onClick={() => setQuantity(product.id, qty + 1, variantId)} className="w-8 h-8 grid place-items-center hover:bg-steel-50" aria-label="Increase">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="price font-semibold text-[14.5px]">{formatINR(unitPrice * qty)}</span>
                  </div>
                </div>
                <button aria-label="Remove item" className="text-steel-300 hover:text-accent transition-colors shrink-0" onClick={() => removeLine(product.id, variantId)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="card-surface p-6 h-fit">
          <h2 className="font-display uppercase text-lg mb-5">{t("cart.orderSummary")}</h2>
          <div className="flex justify-between text-[14px] py-2">
            <span className="text-steel-500">{t("cart.subtotal")}</span>
            <span className="price font-medium">{formatINR(subtotal)}</span>
          </div>
          <div className="flex justify-between text-[14px] py-2 border-b border-line">
            <span className="text-steel-500">{t("cart.shippingLabel")}</span>
            <span className="text-steel-500">{t("cart.shippingNote")}</span>
          </div>
          <div className="flex justify-between text-[15px] py-4 font-semibold">
            <span>{t("cart.total")}</span>
            <span className="price">{formatINR(subtotal)}</span>
          </div>
          <button disabled aria-disabled="true" className="btn-primary w-full justify-center opacity-50 cursor-not-allowed">
            {t("cart.checkout")} <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-[12px] text-steel-500 text-center mt-3">{t("cart.demoNote")}</p>
        </div>
      </div>
    </div>
  );
}
