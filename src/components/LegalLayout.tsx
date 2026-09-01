import { useLang } from "../i18n/LanguageContext";

export function LegalLayout({
  eyebrow,
  title,
  date,
  children,
}: {
  eyebrow: string;
  title: string;
  date: string;
  children: React.ReactNode;
}) {
  const { t } = useLang();
  return (
    <div>
      <section className="bg-charcoal-deep text-white py-14 relative overflow-hidden">
        <div className="absolute inset-0 bg-diagonal-lines opacity-30" aria-hidden />
        <div className="container-page relative">
          <span className="eyebrow mb-3">{eyebrow}</span>
          <h1 className="text-3xl sm:text-4xl font-semibold">{title}</h1>
          <p className="text-white/50 text-[13px] font-mono mt-3">{t("legal.lastUpdated", { date })}</p>
        </div>
      </section>
      <div className="container-page py-14 max-w-[70ch]">
        <div className="prose-legal flex flex-col gap-6 text-[14.5px] leading-relaxed text-ink/80 [&_h2]:font-display [&_h2]:uppercase [&_h2]:text-lg [&_h2]:text-ink [&_h2]:mt-4 [&_strong]:text-ink">
          {children}
        </div>
      </div>
    </div>
  );
}
