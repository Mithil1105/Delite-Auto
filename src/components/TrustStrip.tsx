import { ShieldCheck, Clock3, Wrench, Truck } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";

export function TrustStrip() {
  const { t } = useLang();
  const items = [
    { icon: ShieldCheck, title: t("trust.genuineTitle"), body: t("trust.genuineBody") },
    { icon: Clock3, title: t("trust.fittedTitle"), body: t("trust.fittedBody") },
    { icon: Wrench, title: t("trust.workshopTitle"), body: t("trust.workshopBody") },
    { icon: Truck, title: t("trust.deliveryTitle"), body: t("trust.deliveryBody") },
  ];

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line border border-line">
      {items.map(({ icon: Icon, title, body }) => (
        <div key={title} className="bg-white p-6 flex flex-col gap-3">
          <Icon className="w-6 h-6 text-accent" strokeWidth={1.6} />
          <h3 className="font-display uppercase text-[14px] tracking-tightish">{title}</h3>
          <p className="text-[13px] text-steel-500 leading-relaxed">{body}</p>
        </div>
      ))}
    </div>
  );
}
