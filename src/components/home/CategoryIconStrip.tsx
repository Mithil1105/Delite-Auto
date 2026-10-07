import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../lib/icons";
import { Rail, RailItem } from "../Rail";
import { useLang } from "../../i18n/LanguageContext";
import { track } from "../../lib/analytics/client";

type T = ReturnType<typeof useLang>["t"];

/**
 * Default (non-CMS) items. Images are dedicated category-tile art under public/images/categories/
 * (cropped from the Figma reference — replace any file in place with a higher-resolution export,
 * keeping the filename). They are NOT Odoo data and NOT the mock-catalog product photos: those
 * were either the wrong subject (a side stand for "Handle Grips") or a marketing collage (floor
 * mats). When Homepage Categories are curated in Delite Admin, `cmsItems` replaces all of this
 * with real Odoo public categories.
 */
const items = [
  { image: "/images/categories/car-seat-covers.png", label: (t: T) => t("home.categoryStrip.carSeatCovers"), href: "/shop?category=seat-covers&vehicle=car" },
  { image: "/images/categories/bike-seat-covers.png", label: (t: T) => t("home.categoryStrip.bikeSeatCovers"), href: "/shop?category=seat-covers&vehicle=bike" },
  { image: "/images/categories/car-mats.png", label: (t: T) => t("home.categoryStrip.carMats"), href: "/shop?category=floor-mats" },
  { image: "/images/categories/handle-grips.png", label: (t: T) => t("home.categoryStrip.handleGrips"), href: "/shop?category=bike-guards" },
  { image: "/images/categories/audio-system.png", label: (t: T) => t("home.categoryStrip.audioSystem"), href: "/shop?category=audio-dashcams" },
  { image: "/images/categories/monitors.png", label: (t: T) => t("home.categoryStrip.monitors"), href: "/shop?category=audio-dashcams" },
  { image: "/images/categories/steel-guard.png", label: (t: T) => t("home.categoryStrip.steelGuard"), href: "/shop?category=bike-guards" },
];

/** A real, CMS-curated Odoo public category (Homepage Categories merchandising) — see
 * Documentations MD/delite-admin.md, "Odoo-ID-only persistence". `image` is a resolved Storage
 * public URL (already built by the caller), never a raw media id/path. */
export interface CmsCategoryItem {
  categoryId: number;
  name: string;
  image?: string;
}

type CategoryStripCellProps = {
  href: string;
  label: React.ReactNode;
  children: React.ReactNode;
};

/** Equal-width cell: fixed-height media slot + reserved label region, so every image sits on one centerline and a two-line label never shifts a neighbour. */
function CategoryStripCell({ href, label, children }: CategoryStripCellProps) {
  return (
    <RailItem className="grow basis-[136px] min-w-[136px]">
      <Link
        to={href}
        onClick={() => track("navigation_click", { surface: "home_category_strip", metadata: { target: href } })}
        className="group flex w-full flex-col items-center gap-6 text-center outline-offset-4 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <span className="category-tile-media">{children}</span>
        <span className="category-strip-label">{label}</span>
      </Link>
    </RailItem>
  );
}

/** `item.image` is a URL that may genuinely 404 (a category with no image set in Odoo, and no
 * manually-uploaded CMS override either) — the browser can't know that until it tries, so this
 * tracks per-tile load failure locally and swaps to the generic icon instead of a broken-image
 * glyph, same graceful-degradation the rest of this component already follows. */
function CategoryTileImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Icon name="Package" strokeWidth={1.5} />;
  return <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

/**
 * `cmsItems`, when provided (non-empty), REPLACES the hardcoded items with real, CMS-curated Odoo
 * public categories — same additive-prop pattern as Hero/AnnouncementBar: omit the prop and this
 * renders the defaults. Visual design (tile, label, Rail) is identical either way — CMS controls
 * content/selection, not layout.
 */
export function CategoryIconStrip({ cmsItems }: { cmsItems?: CmsCategoryItem[] } = {}) {
  const { t } = useLang();

  if (cmsItems && cmsItems.length > 0) {
    return (
      <Rail centerWhenFits arrowStyle="circle" arrowTop="top-[72px]">
        {cmsItems.map((item) => (
          <CategoryStripCell key={item.categoryId} href={`/shop?category=${item.categoryId}`} label={item.name}>
            {item.image ? <CategoryTileImage src={item.image} /> : <Icon name="Package" strokeWidth={1.5} />}
          </CategoryStripCell>
        ))}
      </Rail>
    );
  }

  return (
    <Rail centerWhenFits arrowStyle="circle" arrowTop="top-[72px]">
      {items.map((item) => (
        <CategoryStripCell key={item.image} href={item.href} label={item.label(t)}>
          <img src={item.image} alt="" loading="lazy" decoding="async" />
        </CategoryStripCell>
      ))}
    </Rail>
  );
}
