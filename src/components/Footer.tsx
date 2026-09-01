import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { Logo } from "./Logo";
import { SocialIcon } from "./SocialIcon";
import { useLang } from "../i18n/LanguageContext";
import { site } from "../data/site";
import { categories } from "../data/categories";

export function Footer() {
  const { t, dict } = useLang();
  const firstHours = dict.contact.hours[0];

  return (
    <footer className="bg-charcoal-deep text-white/70">
      <div className="container-page py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1.1fr]">
        <div>
          <Link to="/" className="inline-block text-xl mb-4">
            <Logo light />
          </Link>
          <p className="text-[13.5px] leading-relaxed max-w-[32ch] text-white/55">
            {t("footer.tagline", { year: site.founded })}
          </p>
          <div className="flex items-center gap-3 mt-5">
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
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.shopHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px]">
            {categories.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <Link to={`/shop?category=${c.slug}`} className="hover:text-white transition-colors">
                  {t(`categories.${c.slug}.name`)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.companyHeading")}</h3>
          <ul className="space-y-2.5 text-[13.5px]">
            <li><Link to="/about" className="hover:text-white transition-colors">{t("footer.ourStory")}</Link></li>
            <li><Link to="/brands" className="hover:text-white transition-colors">{t("footer.brandsWeCarry")}</Link></li>
            <li><Link to="/contact" className="hover:text-white transition-colors">{t("footer.contactUs")}</Link></li>
            <li><Link to="/terms" className="hover:text-white transition-colors">{t("footer.terms")}</Link></li>
            <li><Link to="/refund-policy" className="hover:text-white transition-colors">{t("footer.refundPolicy")}</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-white text-[13px] font-display font-semibold uppercase tracking-widish mb-4">{t("footer.visitHeading")}</h3>
          <ul className="space-y-3 text-[13.5px]">
            <li className="flex gap-2.5"><MapPin className="w-4 h-4 shrink-0 mt-0.5 text-accent" /><span>{site.address}</span></li>
            <li className="flex gap-2.5"><Phone className="w-4 h-4 shrink-0 mt-0.5 text-accent" /><a href={`tel:${site.phone.replace(/\s/g, "")}`} className="hover:text-white transition-colors">{site.phone}</a></li>
            <li className="flex gap-2.5"><Mail className="w-4 h-4 shrink-0 mt-0.5 text-accent" /><a href={`mailto:${site.email}`} className="hover:text-white transition-colors">{site.email}</a></li>
            <li className="flex gap-2.5"><Clock className="w-4 h-4 shrink-0 mt-0.5 text-accent" /><span>{firstHours.day}: {firstHours.time}</span></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[12px] text-white/40 font-mono">
          <span>&copy; {new Date().getFullYear()} Delite Auto Accessories. {t("footer.rights")}</span>
          <span>Navrangpura, Ahmedabad, GJ 380009</span>
        </div>
      </div>
    </footer>
  );
}
