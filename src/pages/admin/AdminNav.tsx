import { NavLink } from "react-router-dom";
import { useLang } from "../../i18n/LanguageContext";

export function AdminNav() {
  const { t } = useLang();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `pb-3 text-[13.5px] font-semibold border-b-2 transition-colors ${isActive ? "border-brand-500 text-brand-700" : "border-transparent text-steel-500 hover:text-ink"}`;

  return (
    <div className="border-b border-line mb-8 flex gap-6">
      <NavLink to="/admin" end className={linkClass}>{t("admin.ordersTab")}</NavLink>
      <NavLink to="/admin/reviews" className={linkClass}>{t("admin.reviewsTab")}</NavLink>
    </div>
  );
}
