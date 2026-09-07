import { Truck, RotateCcw, ShieldCheck, Headphones } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";

export function TrustBadgesRow() {
  const { t } = useLang();
  const items = [
    { icon: Truck, title: t("trust.freeDeliveryTitle"), body: t("trust.freeDeliveryBody") },
    { icon: RotateCcw, title: t("trust.easyReturnsTitle"), body: t("trust.easyReturnsBody") },
    { icon: ShieldCheck, title: t("trust.genuineTitle"), body: t("trust.genuineBody") },
    { icon: Headphones, title: t("trust.supportTitle"), body: t("trust.supportBody") },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
      {items.map(({ icon: Icon, title, body }) => (
        <div key={title} className="flex flex-col items-center text-center gap-2">
          <span className="grid place-items-center w-11 h-11 rounded-full bg-brand-50 text-brand-700">
            <Icon className="w-5 h-5" strokeWidth={1.6} />
          </span>
          <h3 className="text-[13px] font-semibold">{title}</h3>
          <p className="text-[12px] text-steel-500 leading-snug max-w-[18ch]">{body}</p>
        </div>
      ))}
    </div>
  );
}
