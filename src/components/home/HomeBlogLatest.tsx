import { Link } from "react-router-dom";
import { FullBleedSection } from "../layout/FullBleedSection";
import { BlogCard } from "../blog/Blog";
import { useBlogPosts } from "../../hooks/useBlogPosts";
import { useLang } from "../../i18n/LanguageContext";

/** Home page "Latest from our blog": the 3 newest live posts; renders nothing until there is at least one. */
export function HomeBlogLatest({ title, ctaLabel }: { title?: string; ctaLabel?: string }) {
  const { t } = useLang();
  const posts = useBlogPosts(3);
  if (!posts || posts.length === 0) return null;
  return (
    <FullBleedSection spacing="normal" containerSize="wide">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-2xl heading sm:text-3xl">{title || t("blog.latestTitle")}</h2>
        <Link to="/blog" className="whitespace-nowrap text-[13px] font-semibold text-brand-700 hover:underline">{ctaLabel || t("blog.viewAll")}</Link>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((p) => (
          <BlogCard key={p.id} post={p} />
        ))}
      </div>
    </FullBleedSection>
  );
}
