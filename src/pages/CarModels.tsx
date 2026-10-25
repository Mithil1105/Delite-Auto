import { Link } from "react-router-dom";
import { CarModelGrid } from "../components/home/CarModelGrid";
import { SeoHead } from "../components/SeoHead";
import { carModels } from "../data/carModels";
import { useLang } from "../i18n/LanguageContext";

/** /cars — every car model we show, each linking to its own accessories page. */
export default function CarModels() {
  const { t } = useLang();
  const credited = carModels.filter((m) => m.credit);

  return (
    <div className="bg-white">
      <SeoHead routeKey="cars" />
      <div className="container-page py-10 sm:py-14">
        <nav className="text-[12.5px] text-steel-500 mb-4">
          <Link to="/" className="hover:underline">{t("carModels.home")}</Link> / <span className="text-ink">{t("carModels.indexTitle")}</span>
        </nav>
        <h1 className="text-3xl sm:text-4xl heading mb-2">{t("carModels.indexTitle")}</h1>
        <p className="text-[14.5px] text-steel-500 mb-8 max-w-[60ch]">{t("carModels.indexDesc")}</p>
        <CarModelGrid />

        {credited.length > 0 && (
        <details className="mt-12 text-[12px] text-steel-500">
          <summary className="cursor-pointer select-none">{t("carModels.photoCredits")}</summary>
          <ul className="mt-3 space-y-1">
            {credited.map((m) => (
              <li key={m.slug}>
                {m.make} {m.name}: {m.credit!.author},{" "}
                <a href={m.credit!.url} target="_blank" rel="noreferrer" className="underline">
                  {m.credit!.license}
                </a>
                , Wikimedia Commons
              </li>
            ))}
          </ul>
        </details>
        )}
      </div>
    </div>
  );
}
