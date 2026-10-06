import { useRef, useState, type FormEvent } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";
import { track } from "../lib/analytics/client";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

const inputClass =
  "w-full h-11 px-3.5 border border-line bg-white text-[14px] focus:outline-none focus:border-ink transition-colors";

/** Real submission via the contact-submit Edge Function (rate-limited, service-role — see
 * Documentations MD/delite-contact-and-admin-media.md). Previously this form was fully decorative
 * — no field was ever read, submit just showed a fake success card. */
export function ContactForm({ dark = false }: { dark?: boolean }) {
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const { t } = useLang();
  const { session } = useAuth();
  const labelClass = `block text-[12px] uppercase tracking-wide mb-1.5 ${dark ? "text-white/60" : "text-steel-500"}`;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — always empty for a real visitor

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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError(t("auth.notConfigured"));
      return;
    }
    setError(null);
    setSubmitting(true);
    track("contact_submitted", { surface: "contact_form" });

    const message = vehicleModel.trim() ? `Vehicle: ${vehicleModel.trim()}\n\n${question.trim()}` : question.trim();
    const headers = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined;
    const { data, error: invokeError } = await supabase.functions.invoke("contact-submit", {
      body: { name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, subject: subject.trim() || undefined, message, website },
      headers,
    });
    setSubmitting(false);

    if (invokeError || data?.error) {
      setError(data?.error ?? t("contactForm.submitError"));
      return;
    }
    setSent(true);
  };

  return (
    <form
      // Only that the form was started/submitted is recorded — never any field content.
      onFocusCapture={() => {
        if (started.current) return;
        started.current = true;
        track("contact_started", { surface: "contact_form" });
      }}
      onSubmit={onSubmit}
      className="grid sm:grid-cols-2 gap-4"
    >
      {/* Honeypot — hidden from real visitors via CSS, never via type="hidden" (some bots skip those) */}
      <div className="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
        <label htmlFor="contact-website">Leave this field empty</label>
        <input id="contact-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>
      <div className="sm:col-span-1">
        <label className={labelClass}>{t("contactForm.name")}</label>
        <input required type="text" className={inputClass} placeholder={t("contactForm.namePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="sm:col-span-1">
        <label className={labelClass}>{t("contactForm.phone")}</label>
        <input type="tel" className={inputClass} placeholder="+91" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="sm:col-span-1">
        <label className={labelClass}>{t("contactForm.email")}</label>
        <input required type="email" className={inputClass} placeholder={t("contactForm.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="sm:col-span-1">
        <label className={labelClass}>{t("contactForm.vehicleModel")}</label>
        <input type="text" className={inputClass} placeholder={t("contactForm.vehiclePlaceholder")} value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>{t("contactForm.subject")}</label>
        <input required type="text" className={inputClass} placeholder={t("contactForm.subjectPlaceholder")} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="sm:col-span-2">
        <label className={labelClass}>{t("contactForm.question")}</label>
        <textarea required rows={4} className={`${inputClass} h-auto py-3`} placeholder={t("contactForm.questionPlaceholder")} value={question} onChange={(e) => setQuestion(e.target.value)} />
      </div>
      {error && <p className="sm:col-span-2 text-[13px] text-sale">{error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50 disabled:pointer-events-none">
          {submitting ? t("contactForm.submitting") : t("contactForm.submit")} <Send className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
