import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { BlogCard } from "../components/blog/Blog";
import { useBlogPosts } from "../hooks/useBlogPosts";
import { usePageMeta } from "../hooks/usePageMeta";
import { useLang } from "../i18n/LanguageContext";

const PAGE = 9;

export default function Blog() {
  const { t } = useLang();
  const posts = useBlogPosts(200);
  const [category, setCategory] = useState<string>("all");
  const [shown, setShown] = useState(PAGE);
  usePageMeta({ title: `${t("blog.title")} — Delite Auto Accessories`, description: t("blog.subtitle") });

  const categories = useMemo(() => [...new Set((posts ?? []).map((p) => p.category))], [posts]);
  const filtered = (posts ?? []).filter((p) => category === "all" || p.category === category);
  const [first, ...rest] = filtered;

  return (
    <div className="bg-white">
      <div className="container-page py-10 sm:py-14">
        <nav className="mb-4 text-[12.5px] text-steel-500">
          <Link to="/" className="hover:underline">{t("carModels.home")}</Link> / <span className="text-ink">{t("blog.title")}</span>
        </nav>
        <h1 className="mb-2 text-3xl heading sm:text-4xl">{t("blog.title")}</h1>
        <p className="mb-8 max-w-[60ch] text-[14.5px] text-steel-500">{t("blog.subtitle")}</p>

        {categories.length > 1 && (
          <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Categories">
            {["all", ...categories].map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => {
                  setCategory(c);
                  setShown(PAGE);
                }}
                className={clsx("rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors", category === c ? "border-ink bg-ink text-white" : "border-line bg-white text-ink/75 hover:border-ink")}
              >
                {c === "all" ? t("faq.all") : c}
              </button>
            ))}
          </div>
        )}

        {posts === null ? (
          <p className="py-10 text-[14px] text-steel-500">…</p>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-[14px] text-steel-500">{t("blog.noPosts")}</p>
        ) : (
          <div className="flex flex-col gap-6">
            <BlogCard post={first} large />
            {rest.length > 0 && (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.slice(0, shown - 1).map((p) => (
                  <BlogCard key={p.id} post={p} />
                ))}
              </div>
            )}
            {rest.length > shown - 1 && (
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className="btn-outline mx-auto">{t("reviews.showMore")}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
