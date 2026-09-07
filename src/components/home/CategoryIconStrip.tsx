import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons";
import { Rail, RailItem } from "../Rail";
import { useLang } from "../../i18n/LanguageContext";

const items = [
  { icon: "Car", label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.carSeatCovers"), href: "/shop?category=seat-covers&vehicle=car" },
  { icon: "Bike", label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.bikeSeatCovers"), href: "/shop?category=seat-covers&vehicle=bike" },
  { icon: "Grid2x2", label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.carMats"), href: "/shop?category=floor-mats" },
  { icon: "Grip", label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.handleGrips"), href: "/shop?category=bike-guards" },
  { icon: "Radio", label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.audioSystem"), href: "/shop?category=audio-dashcams" },
  { icon: "Monitor", label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.monitors"), href: "/shop?category=audio-dashcams" },
  { icon: "ShieldCheck", label: (t: ReturnType<typeof useLang>["t"]) => t("home.categoryStrip.steelGuard"), href: "/shop?category=bike-guards" },
];

export function CategoryIconStrip() {
  const { t } = useLang();
  return (
    <Rail>
      {items.map((item) => (
        <RailItem key={item.href + item.icon} className="w-[108px] sm:w-[120px]">
          <Link to={item.href} className="flex flex-col items-center gap-2 text-center group">
            <span className="grid place-items-center w-16 h-16 rounded-full bg-brand-50 text-brand-700 group-hover:bg-brand-600 group-hover:text-white transition-colors">
              <Icon name={item.icon} className="w-7 h-7" strokeWidth={1.6} />
            </span>
            <span className="text-[12px] font-medium leading-snug">{item.label(t)}</span>
          </Link>
        </RailItem>
      ))}
    </Rail>
  );
}
