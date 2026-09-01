import { Link } from "react-router-dom";
import { ArrowRight, Factory, MapPinned, Truck, Users } from "lucide-react";
import { site } from "../data/site";
import { useLang } from "../i18n/LanguageContext";

const capabilityIcons = [Factory, Truck, MapPinned, Users];

export default function About() {
  const { t, dict } = useLang();
  const a = dict.about;
  const vars = { year: site.founded, founder: site.founder, owner: site.currentOwner };

  return (
    <>
      <section className="relative bg-charcoal-deep text-white py-20 sm:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-diagonal-lines opacity-30" aria-hidden />
        <div className="container-page relative text-center max-w-3xl mx-auto">
          <span className="eyebrow justify-center mb-5">{a.heroEyebrow}</span>
          <h1 className="text-4xl sm:text-5xl font-semibold mb-6 leading-tight">{a.heroTitle}</h1>
          <p className="text-white/65 text-[15.5px] leading-relaxed">{a.heroDesc}</p>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page grid lg:grid-cols-2 gap-14 items-start">
          <div>
            <span className="eyebrow mb-4">{a.founderEyebrow}</span>
            <h2 className="text-3xl font-semibold mb-4">{site.founder}</h2>
            <p className="text-[14.5px] text-ink/75 leading-relaxed mb-4">{t("about.founderBody1", vars)}</p>
            <p className="text-[14.5px] text-ink/75 leading-relaxed">{t("about.founderBody2", vars)}</p>
          </div>
          <div>
            <span className="eyebrow mb-4">{a.currentEyebrow}</span>
            <h2 className="text-3xl font-semibold mb-4">{site.currentOwner}</h2>
            <p className="text-[14.5px] text-ink/75 leading-relaxed mb-4">{t("about.currentBody1", vars)}</p>
            <p className="text-[14.5px] text-ink/75 leading-relaxed">{t("about.currentBody2", vars)}</p>
          </div>
        </div>
      </section>

      <section className="section-pad bg-steel-50">
        <div className="container-page">
          <div className="mb-10 max-w-2xl">
            <span className="eyebrow mb-3">{a.timelineEyebrow}</span>
            <h2 className="text-3xl font-semibold">{t("about.timelineTitle", vars)}</h2>
          </div>
          <div className="flex flex-col border-l-2 border-line ml-2">
            {a.milestones.map((m, i) => (
              <div key={m.title} className="relative pl-8 pb-10 last:pb-0">
                <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-accent border-4 border-steel-50" />
                <div className="font-mono text-[12px] uppercase tracking-widish text-accent mb-1">{m.year}</div>
                <h3 className="font-display uppercase text-lg mb-1.5">{m.title}</h3>
                <p className="text-[14px] text-steel-500 leading-relaxed max-w-[60ch]">{t(`about.milestones.${i}.body`, vars)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad">
        <div className="container-page grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {a.capabilities.map((c, i) => {
            const Icon = capabilityIcons[i];
            return (
              <div key={c.label} className="card-surface p-6">
                <Icon className="w-6 h-6 text-accent mb-3" strokeWidth={1.6} />
                <h3 className="font-display uppercase text-[14px] mb-1.5">{c.label}</h3>
                <p className="text-[13px] text-steel-500 leading-relaxed">{c.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="pb-24">
        <div className="container-page">
          <div className="bg-charcoal-deep text-white p-10 sm:p-14 flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-diagonal-lines opacity-30" aria-hidden />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-semibold mb-2">{a.ctaTitle}</h2>
              <p className="text-white/60 text-[14.5px]">{site.address}</p>
            </div>
            <Link to="/contact" className="btn-primary relative shrink-0">
              {a.ctaBtn} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
