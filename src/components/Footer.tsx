import { Link } from "react-router-dom";
import { Phone, Mail, MapPin } from "lucide-react";
import { SocialIcon } from "./SocialIcon";
import { useLang } from "../i18n/LanguageContext";
import { site } from "../data/site";
import { vehicleBrandsFor } from "../data/vehicleBrands";

export function Footer() {
  const { t, dict } = useLang();
  const carBrands = vehicleBrandsFor("car").slice(0, 7);
  const bikeBrands = vehicleBrandsFor("bike").slice(0, 7);

  return (
    <footer className="bg-charcoal-deep text-white/70">
      <div className="container-page py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.contactHeading")}</h3>
          <ul className="space-y-3 text-[13px] mb-5">
            {site.locations.map((loc) => (
              <li key={loc.name} className="flex gap-2.5">
                <MapPin className="w-4 h-4 shrink-0 mt-0.5 text-accent" />
                <span>
                  <span className="text-white font-medium">{loc.name}</span> — {loc.address}
                </span>
              </li>
            ))}
            <li className="flex gap-2.5">
              <Phone className="w-4 h-4 shrink-0 mt-0.5 text-accent" />
              <span>
                <a href={`tel:${site.phone.replace(/\s/g, "")}`} className="hover:text-white transition-colors">{site.phone}</a>
                {" / "}
                <a href={`tel:${site.phoneAlt.replace(/\s/g, "")}`} className="hover:text-white transition-colors">{site.phoneAlt}</a>
              </span>
            </li>
            <li className="flex gap-2.5">
              <Mail className="w-4 h-4 shrink-0 mt-0.5 text-accent" />
              <a href={`mailto:${site.email}`} className="hover:text-white transition-colors">{site.email}</a>
            </li>
          </ul>
          <div className="text-[12px] uppercase tracking-widish text-white/50 mb-2">{t("footer.followUsHeading")}</div>
          <div className="flex items-center gap-3">
            <a href={site.social.instagram} aria-label="Instagram" className="grid place-items-center w-9 h-9 border border-white/15 hover:border-accent hover:text-accent transition-colors">
              <SocialIcon kind="instagram" />
            </a>
            <a href={site.social.facebook} aria-label="Facebook" className="grid place-items-center w-9 h-9 border border-white/15 hover:border-accent hover:text-accent transition-colors">
              <SocialIcon kind="facebook" />
            </a>
            <a href={site.social.youtube} aria-label="YouTube" className="grid place-items-center w-9 h-9 border border-white/15 hover:border-accent hover:text-accent transition-colors">
              <SocialIcon kind="youtube" />
            </a>
          </div>
        </div>

        <div>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.quickLinksHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px] mb-6">
            <li><Link to="/" className="hover:text-white transition-colors">{t("footer.quickLinks.home")}</Link></li>
            <li><Link to="/about" className="hover:text-white transition-colors">{t("footer.quickLinks.about")}</Link></li>
            <li><Link to="/about" className="hover:text-white transition-colors">{t("footer.quickLinks.ourTeam")}</Link></li>
            <li><Link to="/shop?tag=bestseller" className="hover:text-white transition-colors">{t("footer.quickLinks.deals")}</Link></li>
            <li><Link to="/contact" className="hover:text-white transition-colors">{t("footer.quickLinks.faqs")}</Link></li>
          </ul>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.linksHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px]">
            <li><Link to="/cart" className="hover:text-white transition-colors">{t("footer.links.myOrders")}</Link></li>
            <li><Link to="/refund-policy" className="hover:text-white transition-colors">{t("footer.links.returnsRefunds")}</Link></li>
            <li><Link to="/terms" className="hover:text-white transition-colors">{t("footer.links.privacyPolicy")}</Link></li>
            <li><Link to="/terms" className="hover:text-white transition-colors">{t("footer.links.termsConditions")}</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.popularCarBrandsHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px] mb-6">
            {carBrands.map((b) => (
              <li key={b.slug}><Link to="/brands" className="hover:text-white transition-colors">{b.name}</Link></li>
            ))}
            <li><Link to="/brands" className="text-accent hover:text-white transition-colors">{t("footer.viewAll")}</Link></li>
          </ul>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.carAccessoriesHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px]">
            {dict.footer.carAccessories.map((label) => (
              <li key={label}><Link to="/shop?vehicle=car" className="hover:text-white transition-colors">{label}</Link></li>
            ))}
            <li><Link to="/shop?vehicle=car" className="text-accent hover:text-white transition-colors">{t("footer.viewAll")}</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.popularBikeBrandsHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px] mb-6">
            {bikeBrands.map((b) => (
              <li key={b.slug}><Link to="/brands" className="hover:text-white transition-colors">{b.name}</Link></li>
            ))}
            <li><Link to="/brands" className="text-accent hover:text-white transition-colors">{t("footer.viewAll")}</Link></li>
          </ul>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.bikeAccessoriesHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px]">
            {dict.footer.bikeAccessories.map((label) => (
              <li key={label}><Link to="/shop?vehicle=bike" className="hover:text-white transition-colors">{label}</Link></li>
            ))}
            <li><Link to="/shop?vehicle=bike" className="text-accent hover:text-white transition-colors">{t("footer.viewAll")}</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page py-5 text-center text-[12px] text-white/40 font-mono">
          &copy; {new Date().getFullYear()} DeliteAuto. {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
}
