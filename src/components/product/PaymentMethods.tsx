import { useState } from "react";
import { useLang } from "../../i18n/LanguageContext";

/**
 * Accepted-payment logos shown on the right of the Buy Now button — a small fanned stack, the same
 * treatment as the Hasto storefront. These are the real UPI / Visa / Mastercard / Cash-on-Delivery
 * artwork in /public/images/payments/ (trademarked marks, so never redrawn); a logo that fails to
 * load falls back to its text name instead of an empty box. Mirrors what checkout really supports
 * (see product.deliveryPaymentBody).
 */
const BADGES = [
  { key: "upi", labelKey: "product.payUpi", src: "/images/payments/upi.png", rotate: -6, y: 2 },
  { key: "visa", labelKey: "product.payCards", src: "/images/payments/visa.png", rotate: -2, y: 0 },
  { key: "mastercard", labelKey: "product.payCards", src: "/images/payments/mastercard.png", rotate: 2, y: 0 },
  { key: "cod", labelKey: "product.payCod", src: "/images/payments/cod.jpg", rotate: 6, y: -2 },
] as const;

function Badge({ label, src, rotate, y, offset, z }: { label: string; src: string; rotate: number; y: number; offset: number; z: number }) {
  const [hasLogo, setHasLogo] = useState(true);
  return (
    <span
      aria-hidden="true"
      className="relative grid h-7 min-w-7 flex-none place-items-center overflow-hidden rounded-md border border-ink/15 bg-white px-0.5 shadow-[0_2px_6px_rgba(17,24,39,0.18)]"
      style={{ marginLeft: offset, transform: `translateY(${y}px) rotate(${rotate}deg)`, zIndex: z }}
    >
      {hasLogo ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setHasLogo(false)} className="h-[18px] w-auto max-w-[30px] object-contain" />
      ) : (
        <span className="whitespace-nowrap px-0.5 text-[7px] font-semibold uppercase leading-none text-ink/70">{label}</span>
      )}
    </span>
  );
}

export function PaymentMethods({ className }: { className?: string }) {
  const { t } = useLang();
  return (
    <span role="img" aria-label={`${t("product.payUpi")}, ${t("product.payCards")}, ${t("product.payCod")}`} className={`inline-flex items-center ${className ?? ""}`}>
      {BADGES.map(({ key, labelKey, src, rotate, y }, i) => (
        <Badge key={key} label={t(labelKey)} src={src} rotate={rotate} y={y} offset={i === 0 ? 0 : -8} z={i + 1} />
      ))}
    </span>
  );
}
