import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { useLang } from "../i18n/LanguageContext";

export default function NotFound() {
  const { t } = useLang();
  return (
    <div className="container-page py-28 flex flex-col items-center text-center">
      <Compass className="w-12 h-12 text-accent mb-5" />
      <div className="font-display text-6xl mb-3">404</div>
      <h1 className="text-2xl font-semibold mb-2">{t("notFound.title")}</h1>
      <p className="text-steel-500 text-[14.5px] mb-6 max-w-[40ch]">{t("notFound.desc")}</p>
      <Link to="/" className="btn-dark">{t("notFound.backHome")}</Link>
    </div>
  );
}
