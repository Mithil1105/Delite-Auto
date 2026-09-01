import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { site } from "../data/site";
import { useLang } from "../i18n/LanguageContext";

export function FounderTeaser() {
  const { t } = useLang();

  return (
    <section className="section-pad bg-charcoal-deep text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-diagonal-lines opacity-30" aria-hidden />
      <div className="container-page relative grid lg:grid-cols-[0.9fr_1.1fr] gap-10 items-center">
        <div>
          <span className="eyebrow mb-4">{t("founder.eyebrow")}</span>
          <h2 className="text-3xl sm:text-4xl font-semibold leading-tight mb-5">{t("founder.title")}</h2>
          <p className="text-white/65 text-[15px] leading-relaxed mb-4 max-w-[52ch]">
            {t("founder.body", { year: site.founded, founder: site.founder, owner: site.currentOwner })}
          </p>
          <Link to="/about" className="inline-flex items-center gap-1.5 font-mono text-[12.5px] uppercase tracking-widish text-accent group">
            {t("founder.readStory")} <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="border border-white/15 p-6">
            <div className="font-display text-4xl text-accent mb-1">{site.founded}</div>
            <div className="text-[12.5px] uppercase tracking-wide text-white/55">{t("founder.foundedLabel", { founder: site.founder })}</div>
          </div>
          <div className="border border-white/15 p-6">
            <div className="font-display text-4xl text-accent mb-1">{t("founder.generationsValue")}</div>
            <div className="text-[12.5px] uppercase tracking-wide text-white/55">{t("founder.generationsLabel")}</div>
          </div>
          <div className="border border-white/15 p-6 col-span-2">
            <div className="font-display text-4xl text-accent mb-1">Pan-India</div>
            <div className="text-[12.5px] uppercase tracking-wide text-white/55">{t("founder.panIndiaLabel", { owner: site.currentOwner })}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
