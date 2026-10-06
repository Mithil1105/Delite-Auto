import { Check, LayoutDashboard, Sparkles } from "lucide-react";
import { useAdminAppearance, type AdminAppearance } from "../../appearance/AdminAppearance";

const options: { id: AdminAppearance; title: string; description: string; icon: typeof Sparkles }[] = [
  { id: "glass", title: "Glass iOS", description: "Layered surfaces, soft colour, and clearer analytics at a glance.", icon: Sparkles },
  { id: "legacy", title: "Legacy", description: "The original Delite Admin layout with improved spacing and readability.", icon: LayoutDashboard },
];
export default function AppearanceSettings() {
  const { appearance, setAppearance } = useAdminAppearance();
  return <div className="p-6 lg:p-10 max-w-3xl space-y-6"><div><h1 className="font-display text-2xl">Admin Appearance</h1><p className="text-sm text-steel-500">Changes how Delite Admin looks on this browser only — the storefront your customers see is unaffected. Applies immediately.</p></div>
    <section className="grid sm:grid-cols-2 gap-4" aria-label="Admin appearance">
      {options.map(({ id, title, description, icon: Icon }) => <button key={id} type="button" aria-pressed={appearance === id} onClick={() => setAppearance(id)} className={`card-surface text-left p-5 rounded-2xl border-2 transition-all ${appearance === id ? "border-brand-600 shadow-lg" : "border-transparent hover:border-brand-300"}`}>
        <div className="flex items-center justify-between"><Icon className="w-6 h-6 text-brand-700" />{appearance === id && <Check className="w-5 h-5 text-brand-700" />}</div><h2 className="font-semibold mt-5">{title}</h2><p className="text-sm text-steel-500 mt-1">{description}</p>
      </button>)}
    </section></div>;
}
