import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { ContactForm } from "../components/ContactForm";
import { site } from "../data/site";
import { useLang } from "../i18n/LanguageContext";

export default function Contact() {
  const { dict } = useLang();
  const c = dict.contact;
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(site.mapQuery)}&output=embed`;

  return (
    <div>
      <section className="bg-charcoal-deep text-white py-16 sm:py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-diagonal-lines opacity-30" aria-hidden />
        <div className="container-page relative">
          <span className="eyebrow mb-4">{c.heroEyebrow}</span>
          <h1 className="text-4xl sm:text-5xl font-semibold mb-4">{c.heroTitle}</h1>
          <p className="text-white/60 text-[15px] max-w-[54ch]">{c.heroDesc}</p>
        </div>
      </section>

      <section className="container-page py-14 grid lg:grid-cols-[1fr_1.3fr] gap-12">
        <div className="flex flex-col gap-4">
          <div className="card-surface p-6 flex gap-4">
            <MapPin className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display uppercase text-[13.5px] mb-1">{c.visitTitle}</h3>
              <p className="text-[13.5px] text-steel-500">{site.address}</p>
            </div>
          </div>
          <div className="card-surface p-6 flex gap-4">
            <Phone className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display uppercase text-[13.5px] mb-1">{c.callTitle}</h3>
              <a href={`tel:${site.phone.replace(/\s/g, "")}`} className="block text-[13.5px] text-steel-500 hover:text-ink">{site.phone}</a>
              <a href={`tel:${site.phoneAlt.replace(/\s/g, "")}`} className="block text-[13.5px] text-steel-500 hover:text-ink">{site.phoneAlt}</a>
            </div>
          </div>
          <div className="card-surface p-6 flex gap-4">
            <Mail className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display uppercase text-[13.5px] mb-1">{c.emailTitle}</h3>
              <a href={`mailto:${site.email}`} className="text-[13.5px] text-steel-500 hover:text-ink">{site.email}</a>
            </div>
          </div>
          <div className="card-surface p-6 flex gap-4">
            <Clock className="w-5 h-5 text-accent shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display uppercase text-[13.5px] mb-2">{c.hoursTitle}</h3>
              {c.hours.map((h) => (
                <div key={h.day} className="flex justify-between gap-4 text-[13px] text-steel-500 py-0.5">
                  <span>{h.day}</span>
                  <span className="font-mono">{h.time}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="aspect-[4/3] border border-line overflow-hidden">
            <iframe
              title="Delite Auto Accessories location"
              src={mapSrc}
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>

        <div className="card-surface p-6 sm:p-10">
          <h2 className="text-2xl font-semibold mb-2">{c.formTitle}</h2>
          <p className="text-steel-500 text-[14px] mb-8">{c.formDesc}</p>
          <ContactForm />
        </div>
      </section>
    </div>
  );
}
