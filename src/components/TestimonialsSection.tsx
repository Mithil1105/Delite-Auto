import { Quote } from "lucide-react";
import { testimonials } from "../data/testimonials";
import { SectionHeading } from "./SectionHeading";
import { useLang } from "../i18n/LanguageContext";

export function TestimonialsSection() {
  const { t } = useLang();
  return (
    <section className="section-pad bg-steel-50">
      <div className="container-page">
        <SectionHeading eyebrow={t("testimonials.eyebrow")} title={t("testimonials.title")} description={t("testimonials.desc")} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.slice(0, 6).map((t) => (
            <figure key={t.name} className="card-surface p-6 flex flex-col">
              <Quote className="w-6 h-6 text-accent mb-3" />
              <blockquote className="text-[14.5px] leading-relaxed text-ink/85 flex-1">&ldquo;{t.quote}&rdquo;</blockquote>
              <figcaption className="mt-5 pt-4 border-t border-line">
                <div className="font-semibold text-[13.5px]">{t.name}</div>
                <div className="text-[12px] text-steel-500">{t.vehicle} &middot; {t.location}</div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
