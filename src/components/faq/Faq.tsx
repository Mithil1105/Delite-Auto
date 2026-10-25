import { useId, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus, Search } from "lucide-react";
import clsx from "clsx";
import { FAQ_CATEGORIES, faqs, type FaqCategory, type FaqItem } from "../../data/faqs";
import { AccordionPanel } from "../ui/AccordionPanel";
import { Dialog } from "../ui/Dialog";
import { useLang } from "../../i18n/LanguageContext";

/** Question rows that open one at a time. */
export function FaqList({ items }: { items: FaqItem[] }) {
  const base = useId();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="border-t border-line">
      {items.map((f) => {
        const open = openId === f.id;
        const btnId = `${base}-${f.id}-btn`;
        const panelId = `${base}-${f.id}-panel`;
        return (
          <div key={f.id} className="border-b border-line">
            <h3>
              <button type="button" id={btnId} aria-expanded={open} aria-controls={panelId} onClick={() => setOpenId(open ? null : f.id)} className="flex w-full items-center justify-between gap-4 py-4 text-left">
                <span className={clsx("text-[14.5px] font-semibold transition-colors", open ? "text-brand-700" : "text-ink")}>{f.question}</span>
                {open ? <Minus className="h-4 w-4 shrink-0 text-steel-500" /> : <Plus className="h-4 w-4 shrink-0 text-steel-500" />}
              </button>
            </h3>
            <AccordionPanel open={open} id={panelId} labelledBy={btnId}>
              <p className="max-w-[70ch] text-[14px] leading-relaxed text-ink/75">{f.answer}</p>
            </AccordionPanel>
          </div>
        );
      })}
    </div>
  );
}

/** Search + category chips + the question list — used by the /faq page and the pop-up. */
export function FaqBrowser() {
  const { t } = useLang();
  const [category, setCategory] = useState<FaqCategory | "all">("all");
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return faqs.filter((f) => (category === "all" || f.category === category) && (!q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)));
  }, [category, query]);

  return (
    <div className="flex flex-col gap-4">
      <label className="relative block">
        <span className="sr-only">{t("faq.search")}</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-steel-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("faq.search")}
          className="h-11 w-full rounded-full border border-line bg-white pl-10 pr-4 text-[14px] focus:border-ink focus:outline-none"
        />
      </label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Categories">
        {(["all", ...FAQ_CATEGORIES] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            aria-pressed={category === c}
            className={clsx("rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors", category === c ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/75 hover:border-ink")}
          >
            {c === "all" ? t("faq.all") : c}
          </button>
        ))}
      </div>
      {results.length === 0 ? <p className="py-6 text-[14px] text-steel-500">{t("faq.noResults")}</p> : <FaqList key={`${category}|${query}`} items={results} />}
    </div>
  );
}

/** Product-page block: the 6 most useful questions, with a pop-up for the rest. */
export function ProductFaq() {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const top = faqs.filter((f) => f.popular).slice(0, 6);
  return (
    <section id="product-faq" className="mb-16 max-w-3xl" aria-labelledby="product-faq-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 id="product-faq-title" className="text-xl heading sm:text-2xl">{t("faq.sectionTitle")}</h2>
        <button type="button" onClick={() => setOpen(true)} className="whitespace-nowrap text-[13px] font-semibold text-brand-700 hover:underline">
          {t("faq.viewAll")}
        </button>
      </div>
      <FaqList items={top} />
      <p className="mt-4 text-[13px] text-steel-500">
        {t("faq.stillNeedHelp")}{" "}
        <Link to="/contact" className="font-semibold text-brand-700 hover:underline">{t("faq.contactUs")}</Link>
      </p>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("faq.title")}>
        <FaqBrowser />
        <p className="mt-5 text-[13px]">
          <Link to="/faq" onClick={() => setOpen(false)} className="font-semibold text-brand-700 hover:underline">{t("faq.visitPage")}</Link>
        </p>
      </Dialog>
    </section>
  );
}
