import { Link } from "react-router-dom";
import { FaqBrowser } from "../components/faq/Faq";
import { SeoHead } from "../components/SeoHead";
import { useLang } from "../i18n/LanguageContext";

export default function Faq() {
  const { t } = useLang();
  return (
    <div className="bg-white">
      <SeoHead routeKey="faq" />
      <div className="container-page max-w-3xl py-10 sm:py-14">
        <nav className="mb-4 text-[12.5px] text-steel-500">
          <Link to="/" className="hover:underline">{t("carModels.home")}</Link> / <span className="text-ink">{t("faq.title")}</span>
        </nav>
        <h1 className="mb-2 text-3xl heading sm:text-4xl">{t("faq.title")}</h1>
        <p className="mb-8 max-w-[60ch] text-[14.5px] text-steel-500">{t("faq.subtitle")}</p>
        <FaqBrowser />
        <div className="mt-12 rounded-2xl bg-steel-50 p-6 text-center">
          <p className="font-semibold">{t("faq.stillNeedHelp")}</p>
          <Link to="/contact" className="btn-pill-dark mt-3 inline-flex">{t("faq.contactUs")}</Link>
        </div>
      </div>
    </div>
  );
}
