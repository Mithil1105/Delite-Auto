import { Fragment } from "react";
import { Navigate } from "react-router-dom";
import { SeoHead } from "../components/SeoHead";
import { Reveal } from "../components/motion/Reveal";
import type { ComponentType } from "react";
import {
  BiggestSavings,
  BrandStrip,
  BudgetBands,
  CampaignBanner,
  CarOffers,
  ComboPicks,
  DealsHero,
  HotPicks,
  MessageStrip,
  NewArrivals,
  OfferCategory,
  TopRated,
  WhatsAppCta,
  type DealsSectionProps,
} from "../components/deals/DealsSections";
import { DEALS_SETTINGS_KEY } from "../data/dealsSections";
import { useDealsCms } from "../hooks/useDealsCms";

/** Section key → component. Keys must match src/data/dealsSections.ts. */
const DEALS_SECTION_COMPONENTS: Record<string, ComponentType<DealsSectionProps>> = {
  "message-strip": MessageStrip,
  hero: DealsHero,
  campaign: CampaignBanner,
  "hot-picks": HotPicks,
  "offer-category": OfferCategory,
  budget: BudgetBands,
  "car-offers": CarOffers,
  "new-arrivals": NewArrivals,
  "top-rated": TopRated,
  "biggest-savings": BiggestSavings,
  combos: ComboPicks,
  "brand-strip": BrandStrip,
  whatsapp: WhatsAppCta,
};

/** Sections that draw their own full-bleed background and so don't take part in the white/tint alternation. */
const SELF_STYLED_SECTIONS = new Set(["message-strip", "hero", "campaign", "whatsapp"]);

/**
 * /deals — the Deals & Offers page. Which sections appear, in what order and with what text is
 * controlled by the client in Admin → Website → Deals & Offers (a CMS page with an on/off switch
 * per section; see src/data/dealsSections.ts). If the client switches the whole page off, this
 * route sends visitors to the shop instead.
 */
export default function Deals() {
  const { loading, sections, pageEnabled } = useDealsCms();

  if (!loading && !pageEnabled) return <Navigate to="/shop" replace />;
  // Wait for the CMS answer so switched-off sections never flash on screen.
  if (loading) return <div className="min-h-[60vh] bg-white" aria-busy="true" />;

  const visible = sections.filter((s) => s.key !== DEALS_SETTINGS_KEY && s.visible && DEALS_SECTION_COMPONENTS[s.key]);
  let alternate = 0;

  return (
    <div className="bg-white">
      <SeoHead routeKey="deals" />
      {visible.map((s) => {
        const Component = DEALS_SECTION_COMPONENTS[s.key];
        const tone = SELF_STYLED_SECTIONS.has(s.key) ? "white" : alternate++ % 2 === 0 ? "white" : "tint";
        // The top banner and message strip are the first paint — they never wait on a scroll reveal.
        const immediate = s.key === "hero" || s.key === "message-strip";
        return <Fragment key={s.key}>{immediate ? <Component content={s.content} tone={tone} /> : <Reveal><Component content={s.content} tone={tone} /></Reveal>}</Fragment>;
      })}
      {visible.length === 0 && (
        <div className="container-page py-24 text-center text-[14px] text-steel-500">No offers to show right now — check back soon.</div>
      )}
    </div>
  );
}
