import { LegalLayout } from "../components/LegalLayout";
import { site } from "../data/site";
import { useLang } from "../i18n/LanguageContext";

export default function RefundPolicy() {
  const { t, dict } = useLang();
  const refund = dict.legal.refund;

  return (
    <LegalLayout eyebrow={refund.eyebrow} title={refund.title} date="1 September 2026">
      <p>{refund.intro}</p>
      {refund.sections.map((s) => (
        <div key={s.h}>
          <h2>{s.h}</h2>
          <p>{s.p}</p>
        </div>
      ))}

      <h2>{refund.nonReturnableHeading}</h2>
      <ul className="list-disc pl-5 space-y-1.5">
        {refund.nonReturnable.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>{refund.timelineHeading}</h2>
      <p>{refund.timelineBody}</p>

      <h2>{refund.startHeading}</h2>
      <p>{t("legal.refund.startBody", { phone: site.phone, email: site.email, address: site.address })}</p>
    </LegalLayout>
  );
}
