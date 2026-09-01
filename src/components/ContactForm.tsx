import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";

const inputClass =
  "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";

export function ContactForm({ dark = false }: { dark?: boolean }) {
  const [sent, setSent] = useState(false);
  const { t } = useLang();
  const labelClass = `block text-[12px] uppercase tracking-wide mb-1.5 ${dark ? "text-white/60" : "text-steel-500"}`;

  if (sent) {
    return (
      <div className={`flex flex-col items-start gap-3 p-8 border ${dark ? "border-white/15 text-white" : "border-line bg-white"}`}>
        <CheckCircle2 className="w-8 h-8 text-accent" />
        <h3 className="font-display uppercase text-lg">{t("contactForm.sentTitle")}</h3>
        <p className={`text-[14px] ${dark ? "text-white/60" : "text-steel-500"}`}>{t("contactForm.sentDesc")}</p>
        <button type="button" onClick={() => setSent(false)} className="btn-outline mt-2">
          {t("contactForm.sendAnother")}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSent(true);
      }}
      className="grid sm:grid-cols-2 gap-4"
    >
      <div className="sm:col-span-1">
        <label className={labelClass}>{t("contactForm.name")}</label>
        <input required type="text" className={inputClass} placeholder={t("contactForm.namePlaceholder")} />
      </div>
      <div className="sm:col-span-1">
        <label className={labelClass}>{t("contactForm.phone")}</label>
        <input type="tel" className={inputClass} placeholder="+91" />
      </div>
      <div className="sm:col-span-1">
        <label className={labelClass}>{t("contactForm.email")}</label>
        <input required type="email" className={inputClass} placeholder={t("contactForm.emailPlaceholder")} />
      </div>
      <div className="sm:col-span-1">
        <label className={labelClass}>{t("contactForm.vehicleModel")}</label>
        <input type="text" className={inputClass} placeholder={t("contactForm.vehiclePlaceholder")} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>{t("contactForm.subject")}</label>
        <input required type="text" className={inputClass} placeholder={t("contactForm.subjectPlaceholder")} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>{t("contactForm.question")}</label>
        <textarea required rows={4} className={`${inputClass} h-auto py-3`} placeholder={t("contactForm.questionPlaceholder")} />
      </div>
      <div className="sm:col-span-2">
        <button type="submit" className="btn-primary">
          {t("contactForm.submit")} <Send className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
