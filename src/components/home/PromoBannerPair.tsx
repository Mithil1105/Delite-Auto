import { Link } from "react-router-dom";
import { Package, Sparkles } from "lucide-react";
import { useLang } from "../../i18n/LanguageContext";

export function PromoBannerPair() {
  const { t } = useLang();
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <Link
        to="/shop?tag=bestseller"
        className="relative overflow-hidden rounded-2xl p-6 sm:p-8 flex items-center gap-4 text-white bg-gradient-to-br from-brand-400 to-brand-900"
      >
        <div>
          <h3 className="font-display text-xl sm:text-2xl mb-1.5">{t("home.comboDealsTitle")}</h3>
          <p className="text-[13.5px] text-white/75 max-w-[26ch]">{t("home.comboDealsBody")}</p>
        </div>
        <Package className="w-16 h-16 sm:w-20 sm:h-20 text-white/25 ml-auto shrink-0" strokeWidth={1.2} />
      </Link>
      <Link
        to="/shop?tag=new"
        className="relative overflow-hidden rounded-2xl p-6 sm:p-8 flex items-center gap-4 text-white bg-gradient-to-br from-[#5a3fc0] to-[#8a3fc0]"
      >
        <div>
          <h3 className="font-display text-xl sm:text-2xl mb-1.5">{t("home.newLaunchTitle")}</h3>
          <p className="text-[13.5px] text-white/75 max-w-[26ch]">{t("home.newLaunchBody")}</p>
        </div>
        <Sparkles className="w-16 h-16 sm:w-20 sm:h-20 text-white/25 ml-auto shrink-0" strokeWidth={1.2} />
      </Link>
    </div>
  );
}
