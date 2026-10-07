import { Link } from "react-router-dom";
import { Phone, Mail, MapPin } from "lucide-react";
import { SocialIcon } from "./SocialIcon";
import { useLang } from "../i18n/LanguageContext";
import { site } from "../data/site";
import { vehicleBrandsFor } from "../data/vehicleBrands";
import { useSiteChromeCms } from "../hooks/useSiteChromeCms";

interface FooterLink {
  label: string;
  url: string;
}

export interface FooterCmsContent {
  contactPhone?: string;
  contactPhoneAlt?: string;
  contactEmail?: string;
  socialInstagram?: string;
  socialFacebook?: string;
  socialYoutube?: string;
  quickLinks?: FooterLink[];
  links?: FooterLink[];
  copyright?: string;
}

export function Footer({ contentOverride }: { contentOverride?: FooterCmsContent } = {}) {
  const { t, dict } = useLang();
  const carBrands = vehicleBrandsFor("car").slice(0, 7);
  const bikeBrands = vehicleBrandsFor("bike").slice(0, 7);

  // Contact/social/link-groups/copyright only — brand and accessory columns below always show
  // real live catalog data and are intentionally not CMS-driven (see the Footer editor's own
  // note to admins). Falls back to site.ts/i18n field-by-field when nothing is published yet.
  // `contentOverride`, when supplied, short-circuits the live fetch entirely — used only by the
  // admin editor's preview so it can reflect unsaved keystrokes, never used storefront-side.
  const { bySectionKey: chrome } = useSiteChromeCms();
  const footerContent = contentOverride ?? (chrome.get("footer")?.content as FooterCmsContent | undefined) ?? {};
  const quickLinks = footerContent.quickLinks && footerContent.quickLinks.length > 0
    ? footerContent.quickLinks
    : [
        { label: t("footer.quickLinks.home"), url: "/" },
        { label: t("footer.quickLinks.about"), url: "/about" },
        { label: t("footer.quickLinks.ourTeam"), url: "/about" },
        { label: t("footer.quickLinks.deals"), url: "/shop?tag=bestseller" },
        { label: t("footer.quickLinks.faqs"), url: "/contact" },
      ];
  const links = footerContent.links && footerContent.links.length > 0
    ? footerContent.links
    : [
        { label: t("footer.links.myOrders"), url: "/account/orders" },
        { label: t("footer.links.returnsRefunds"), url: "/policies/returns" },
        { label: "Shipping Policy", url: "/policies/shipping" },
        // Was pointing at /terms for both rows (a real pre-existing bug — no privacy page existed
        // yet) — fixed now that one does. See Documentations MD/odoo-checkout-portal-returns.md.
        { label: t("footer.links.privacyPolicy"), url: "/policies/privacy" },
        { label: t("footer.links.termsConditions"), url: "/terms" },
      ];

  return (
    <footer className="bg-charcoal-deep text-white/70">
      <div className="container-page py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.contactHeading")}</h3>
          <ul className="space-y-3 text-[13px] mb-5">
            {site.locations.map((loc) => (
              <li key={loc.name} className="flex gap-2.5">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-brand-400" />
                <span>
                  <span className="text-white font-medium">{loc.name}</span> — {loc.address}
                </span>
              </li>
            ))}
            <li className="flex gap-2.5">
              <Phone className="w-4 h-4 shrink-0 mt-0.5 text-brand-400" />
              <span>
                <a href={`tel:${(footerContent.contactPhone ?? site.phone).replace(/\s/g, "")}`} className="hover:text-white transition-colors">{footerContent.contactPhone ?? site.phone}</a>
                {" / "}
                <a href={`tel:${(footerContent.contactPhoneAlt ?? site.phoneAlt).replace(/\s/g, "")}`} className="hover:text-white transition-colors">{footerContent.contactPhoneAlt ?? site.phoneAlt}</a>
              </span>
            </li>
            <li className="flex gap-2.5">
              <Mail className="w-4 h-4 shrink-0 mt-0.5 text-brand-400" />
              <a href={`mailto:${footerContent.contactEmail ?? site.email}`} className="hover:text-white transition-colors">{footerContent.contactEmail ?? site.email}</a>
            </li>
          </ul>
          <div className="text-[12px] uppercase tracking-widish text-white/50 mb-2">{t("footer.followUsHeading")}</div>
          <div className="flex items-center gap-3">
            <a href={footerContent.socialInstagram ?? site.social.instagram} aria-label="Instagram" className="grid place-items-center w-9 h-9 border border-white/15 hover:border-brand-400 hover:text-brand-400 transition-colors">
              <SocialIcon kind="instagram" />
            </a>
            <a href={footerContent.socialFacebook ?? site.social.facebook} aria-label="Facebook" className="grid place-items-center w-9 h-9 border border-white/15 hover:border-brand-400 hover:text-brand-400 transition-colors">
              <SocialIcon kind="facebook" />
            </a>
            <a href={footerContent.socialYoutube ?? site.social.youtube} aria-label="YouTube" className="grid place-items-center w-9 h-9 border border-white/15 hover:border-brand-400 hover:text-brand-400 transition-colors">
              <SocialIcon kind="youtube" />
            </a>
          </div>
        </div>

        <div>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.quickLinksHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px] mb-6">
            {quickLinks.map((l) => (
              <li key={l.label}><Link to={l.url} className="hover:text-white transition-colors">{l.label}</Link></li>
            ))}
          </ul>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.linksHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px]">
            {links.map((l) => (
              <li key={l.label}><Link to={l.url} className="hover:text-white transition-colors">{l.label}</Link></li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.popularCarBrandsHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px] mb-6">
            {carBrands.map((b) => (
              <li key={b.slug}><Link to="/brands" className="hover:text-white transition-colors">{b.name}</Link></li>
            ))}
            <li><Link to="/brands" className="text-brand-400 hover:text-white transition-colors">{t("footer.viewAll")}</Link></li>
          </ul>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.carAccessoriesHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px]">
            {dict.footer.carAccessories.map((label) => (
              <li key={label}><Link to="/shop?vehicle=car" className="hover:text-white transition-colors">{label}</Link></li>
            ))}
            <li><Link to="/shop?vehicle=car" className="text-brand-400 hover:text-white transition-colors">{t("footer.viewAll")}</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.popularBikeBrandsHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px] mb-6">
            {bikeBrands.map((b) => (
              <li key={b.slug}><Link to="/brands" className="hover:text-white transition-colors">{b.name}</Link></li>
            ))}
            <li><Link to="/brands" className="text-brand-400 hover:text-white transition-colors">{t("footer.viewAll")}</Link></li>
          </ul>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.bikeAccessoriesHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px]">
            {dict.footer.bikeAccessories.map((label) => (
              <li key={label}><Link to="/shop?vehicle=bike" className="hover:text-white transition-colors">{label}</Link></li>
            ))}
            <li><Link to="/shop?vehicle=bike" className="text-brand-400 hover:text-white transition-colors">{t("footer.viewAll")}</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page py-5 text-center text-[12px] text-white/40 font-mono">
          &copy; {new Date().getFullYear()} {footerContent.copyright || `DeliteAuto. ${t("footer.rights")}`}
        </div>
      </div>
    </footer>
  );
}
