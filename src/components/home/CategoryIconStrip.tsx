import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons";
import { Rail, RailItem } from "../Rail";
import { useLang } from "../../i18n/LanguageContext";
import { categoryImages } from "../../lib/categoryImages";

/**
 * `image` is only set where `categoryImages` (src/lib/categoryImages.ts) genuinely depicts what
 * the label claims — e.g. "bike-guards"' representative photo is a side stand, not handlebar
 * grips or a crash guard, so "Handle Grips" and "Steel Guard (SS)" deliberately keep their icon
 * fallback rather than show a misleading real photo (same rule `ProductArt` follows: never
 * borrow an unrelated product's photo). "Bike Seat Covers" has no real photo for the same reason
 * — the mock catalog has no bike seat-cover product yet, only car ones.
 */
const items = [
  {
    icon: "Car",
    image: categoryImages["seat-covers"],
    label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.carSeatCovers"),
    href: "/shop?category=seat-covers&vehicle=car",
  },
  {
    icon: "Bike",
    label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.bikeSeatCovers"),
    href: "/shop?category=seat-covers&vehicle=bike",
  },
  {
    icon: "Grid2x2",
    image: categoryImages["floor-mats"],
    label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.carMats"),
    href: "/shop?category=floor-mats",
  },
  {
    icon: "Grip",
    label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.handleGrips"),
    href: "/shop?category=bike-guards",
  },
  {
    icon: "Radio",
    image: categoryImages["audio-dashcams"],
    label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.audioSystem"),
    href: "/shop?category=audio-dashcams",
  },
  {
    icon: "Monitor",
    label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.monitors"),
    href: "/shop?category=audio-dashcams",
  },
  {
    icon: "ShieldCheck",
    label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.steelGuard"),
    href: "/shop?category=bike-guards",
  },
];

export function CategoryIconStrip() {
  const { t } = useLang();
  return (
    <Rail>
      {items.map((item) => (
        <RailItem key={item.href + item.icon} className="w-[124px] sm:w-[136px]">
          <Link to={item.href} className="flex flex-col items-center gap-3 text-center group">
            <span
              className={
                item.image
                  ? "relative grid place-items-center w-20 h-20 rounded-full overflow-hidden bg-steel-50 ring-1 ring-line group-hover:ring-brand-500 transition-all"
                  : "relative grid place-items-center w-20 h-20 rounded-full overflow-hidden bg-brand-600 text-white group-hover:bg-brand-700 transition-colors"
              }
            >
              {item.image ? (
                <img src={item.image} alt="" className="w-full h-full object-contain p-3.5" />
              ) : (
                <Icon name={item.icon} className="w-9 h-9" strokeWidth={1.75} />
              )}
            </span>
            <span className="text-[12.5px] font-semibold leading-snug">{item.label(t)}</span>
          </Link>
        </RailItem>
      ))}
    </Rail>
  );
}
