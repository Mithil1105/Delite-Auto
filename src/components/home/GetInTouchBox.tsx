import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";

const inputClass =
  "w-full h-11 px-3.5 rounded-lg border border-line bg-white text-[14px] focus:outline-none focus:border-brand-600 transition-colors";

/**
 * Centered lavender "get in touch" box from the Figma homepage — a trimmed-down field
 * set compared to the full `ContactForm` used on the Contact page. UI-only, like the
 * rest of the site's forms. See Documentations MD/figma-homepage-redesign.md.
 */
export function GetInTouchBox() {
  const [sent, setSent] = useState(false);
  const { t } = useLang();

  return (
    <div className="max-w-2xl mx-auto bg-lavender-50 rounded-3xl p-6 sm:p-10">
      {sent ? (
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <CheckCircle2 className="w-9 h-9 text-brand-700" />
          <h3 className="font-display uppercase text-lg">{t("contactForm.sentTitle")}</h3>
          <p className="text-[14px] text-steel-500">{t("contactForm.sentDesc")}</p>
          <button type="button" onClick={() => setSent(false)} className="btn-pill-outline mt-2">
            {t("contactForm.sendAnother")}
          </button>
        </div>
      ) : (
        <>
          <h2 className="text-center font-display text-2xl mb-2">{t("home.getInTouchTitle")}</h2>
          <p className="text-center text-[14px] text-steel-500 max-w-[42ch] mx-auto mb-6">{t("home.getInTouchSubtitle")}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSent(true);
            }}
            className="grid sm:grid-cols-2 gap-4"
          >
            <input required type="text" placeholder={t("home.fieldName")} className={inputClass} />
            <input required type="email" placeholder={t("home.fieldEmail")} className={inputClass} />
            <input type="tel" placeholder={t("home.fieldPhone")} className={inputClass} />
            <input required type="text" placeholder={t("home.fieldSubject")} className={inputClass} />
            <textarea required rows={4} placeholder={t("home.fieldMessage")} className={`${inputClass} h-auto py-3 sm:col-span-2`} />
            <div className="sm:col-span-2 flex justify-center">
              <button type="submit" className="btn-pill-dark px-10">
                {t("home.submitForm")}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
