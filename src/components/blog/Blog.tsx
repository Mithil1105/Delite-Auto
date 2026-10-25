import { Link } from "react-router-dom";
import clsx from "clsx";
import { pickBody, pickText, readingMinutes, type BlogBlock, type BlogPost } from "../../lib/blog";
import { useLang } from "../../i18n/LanguageContext";
import type { Lang } from "../../i18n/LanguageContext";

export const postDate = (iso: string | null, lang: Lang) =>
  iso ? new Date(iso).toLocaleDateString(lang === "en" ? "en-IN" : lang === "hi" ? "hi-IN" : "gu-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

/** Card used on the blog list, the home page section and "more to read". */
export function BlogCard({ post, large = false }: { post: BlogPost; large?: boolean }) {
  const { t, lang } = useLang();
  const title = pickText(post.title, lang);
  const excerpt = pickText(post.excerpt, lang);
  const minutes = readingMinutes(pickBody(post.body, lang));
  return (
    <Link
      to={`/blog/${post.slug}`}
      className={clsx(
        "group flex overflow-hidden rounded-2xl border border-line bg-white shadow-card transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:shadow-lift motion-reduce:hover:translate-y-0",
        large ? "flex-col md:flex-row" : "flex-col"
      )}
    >
      <div className={clsx("relative shrink-0 overflow-hidden bg-steel-100", large ? "aspect-[16/9] md:aspect-auto md:w-[55%]" : "aspect-[16/9]")}>
        {post.coverImage ? (
          <img src={post.coverImage} alt={post.coverAlt || ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none" />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-steel-100 to-steel-200 px-6 text-center font-mono text-[12px] uppercase tracking-widish text-steel-500">{post.category}</div>
        )}
      </div>
      <div className={clsx("flex flex-1 flex-col gap-2 p-5", large && "md:justify-center md:p-8")}>
        <div className="font-mono text-[11px] uppercase tracking-widish text-steel-500">{post.category}</div>
        <h3 className={clsx("font-semibold leading-snug transition-colors group-hover:text-brand-700", large ? "text-xl sm:text-2xl" : "text-[16px]")}>{title}</h3>
        {excerpt && <p className={clsx("text-[13.5px] text-ink/70", large ? "line-clamp-4" : "line-clamp-3")}>{excerpt}</p>}
        <div className="mt-auto pt-2 text-[12px] text-steel-500">
          {postDate(post.publishedAt, lang)} · {t("blog.minRead").replace("{n}", String(minutes))}
        </div>
      </div>
    </Link>
  );
}

/** Renders an article's blocks. Plain text only (no HTML); `wide` lets pictures use more room (photo-story layout). */
export function BlogBlocks({ blocks, wide = false }: { blocks: BlogBlock[]; wide?: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return <h2 key={i} className="mt-4 text-xl heading sm:text-2xl">{b.text}</h2>;
          case "paragraph":
            return <p key={i} className="whitespace-pre-line text-[16px] leading-[1.75] text-ink/80">{b.text}</p>;
          case "quote":
            return (
              <blockquote key={i} className="border-l-4 border-brand-700 bg-steel-50 px-5 py-4">
                <p className="whitespace-pre-line text-[17px] italic leading-relaxed text-ink">{b.text}</p>
                {b.by && <footer className="mt-2 text-[12.5px] font-semibold text-steel-500">— {b.by}</footer>}
              </blockquote>
            );
          case "image":
            return (
              <figure key={i} className={clsx(wide && "md:-mx-12")}>
                <img src={b.src} alt={b.alt || ""} loading="lazy" className="block h-auto w-full rounded-xl" />
                {b.caption && <figcaption className="mt-2 text-center text-[12.5px] text-steel-500">{b.caption}</figcaption>}
              </figure>
            );
          case "gallery":
            return (
              <div key={i} className={clsx("grid gap-3", b.images.length === 1 ? "grid-cols-1" : wide && b.images.length >= 3 ? "grid-cols-2 md:grid-cols-3 md:-mx-12" : "grid-cols-2", !wide && "")}>
                {b.images.map((img, j) => (
                  <img key={j} src={img.src} alt={img.alt || ""} loading="lazy" className="aspect-[4/3] h-full w-full rounded-xl object-cover" />
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}
