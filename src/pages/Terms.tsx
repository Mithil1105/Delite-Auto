import { LegalLayout } from "../components/LegalLayout";
import { site } from "../data/site";
import { useLang } from "../i18n/LanguageContext";

export default function Terms() {
  const { t, dict } = useLang();
  const terms = dict.legal.terms;

  return (
    <LegalLayout eyebrow={terms.eyebrow} title={terms.title} date="1 September 2026">
      <p>{terms.intro}</p>
      {terms.sections.map((s) => (
        <div key={s.h}>
          <h2>{s.h}</h2>
          <p>{s.p}</p>
        </div>
      ))}
      <h2>{terms.contactHeading}</h2>
      <p>{t("legal.terms.contactBody", { email: site.email, address: site.address })}</p>
    </LegalLayout>
  );
}
