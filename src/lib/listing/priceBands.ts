/**
 * Price-range presets shown as chips on listing pages (Shop, a car's accessories page). Labels come
 * from the translation function so they follow the shopper's language.
 */
export interface PriceBand {
  key: string;
  label: string;
  min: number;
  /** undefined = no upper limit */
  max?: number;
}

type Translate = (path: string, vars?: Record<string, string | number>) => string;

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function buildPriceBands(t: Translate): PriceBand[] {
  return [
    { key: "any", label: t("shop.anyPrice"), min: 0 },
    { key: "u500", label: t("shop.priceUnder", { amount: rupees(500) }), min: 0, max: 500 },
    { key: "500-1000", label: t("shop.priceBetween", { min: rupees(500), max: rupees(1000) }), min: 500, max: 1000 },
    { key: "1000-2000", label: t("shop.priceBetween", { min: rupees(1000), max: rupees(2000) }), min: 1000, max: 2000 },
    { key: "2000-5000", label: t("shop.priceBetween", { min: rupees(2000), max: rupees(5000) }), min: 2000, max: 5000 },
    { key: "5000+", label: t("shop.priceAbove", { amount: rupees(5000) }), min: 5000 },
  ];
}

/** Whether a price falls inside a band (min inclusive, max inclusive). */
export const bandContains = (band: PriceBand, price: number): boolean => price >= band.min && (band.max === undefined || price <= band.max);
