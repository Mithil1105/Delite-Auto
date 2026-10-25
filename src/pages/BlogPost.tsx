import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import clsx from "clsx";
import { BlogBlocks, BlogCard, postDate } from "../components/blog/Blog";
import { ProductCarousel } from "../components/product/ProductCarousel";
import { Reveal } from "../components/motion/Reveal";
import { useBlogPosts } from "../hooks/useBlogPosts";
import { useMerchandisedProducts } from "../hooks/useMerchandisingCms";
import { usePageMeta } from "../hooks/usePageMeta";
import { getPostBySlug } from "../services/blog/blogService";
import { isLive, pickBody, pickText, readingMinutes, type BlogPost as Post } from "../lib/blog";
import { useLang } from "../i18n/LanguageContext";

type State = { status: "loading" } | { status: "missing" } | { status: "ready"; post: Post };

export default function BlogPost() {
  const { slug = "" } = useParams();
  const { t, lang } = useLang();
  const [state, setState] = useState<State>({ status: "loading" });
  const others = useBlogPosts(12);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getPostBySlug(slug).then((post) => {
      if (!cancelled) setState(post ? { status: "ready", post } : { status: "missing" });
    });
    window.scrollTo({ top: 0 });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const post = state.status === "ready" ? state.post : null;
  const { products } = useMerchandisedProducts(post?.showProducts ? post.productIds : []);
  const title = post ? pickText(post.title, lang) : "";
  const excerpt = post ? pickText(post.excerpt, lang) : "";
  usePageMeta({ title: title ? `${title} — Delite Auto Accessories` : "", description: excerpt, image: post?.coverImage });

  if (state.status === "loading") return <div className="container-page py-20 text-[14px] text-steel-500">…</div>;
  if (!post) {
    return (
      <div className="container-page py-20 text-center">
        <p className="mb-4 text-[15px] text-steel-500">{t("blog.notFound")}</p>
        <Link to="/blog" className="btn-pill-dark inline-flex">{t("blog.back")}</Link>
      </div>
    );
  }

  const blocks = pickBody(post.body, lang);
  const minutes = readingMinutes(blocks);
  const live = isLive(post);
  const wide = post.layout === "gallery";
  const related = (others ?? []).filter((p) => p.id !== post.id).sort((a, b) => Number(b.category === post.category) - Number(a.category === post.category)).slice(0, 3);
  const meta = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
      <span>{postDate(post.publishedAt, lang)}</span>
      <span aria-hidden>·</span>
      <span>{t("blog.minRead").replace("{n}", String(minutes))}</span>
      {post.authorName && (
        <>
          <span aria-hidden>·</span>
          <span>{t("blog.by").replace("{name}", post.authorName)}</span>
        </>
      )}
    </div>
  );
  const chip = <span className="inline-block rounded-full bg-brand-50 px-3 py-1 font-mono text-[11px] uppercase tracking-widish text-brand-700">{post.category}</span>;

  return (
    <article className="bg-white">
      {!live && <div className="bg-amber-100 px-4 py-2 text-center text-[13px] font-semibold text-amber-900">{t("blog.draftPreview")}</div>}

      {post.layout === "hero" ? (
        <header className="relative isolate flex min-h-[320px] items-end bg-charcoal-deep sm:min-h-[440px]">
          {post.coverImage && <img src={post.coverImage} alt={post.coverAlt || ""} className="absolute inset-0 -z-10 h-full w-full object-cover" />}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/40 to-black/10" aria-hidden />
          <div className="container-page max-w-4xl pb-8 pt-24 text-white sm:pb-12">
            <div className="mb-3">{chip}</div>
            <h1 className="mb-3 text-3xl heading sm:text-5xl">{title}</h1>
            <div className="text-white/80">{meta}</div>
          </div>
        </header>
      ) : post.layout === "split" ? (
        <header className="container-page grid items-center gap-8 pt-10 md:grid-cols-2 sm:pt-14">
          <div>
            <nav className="mb-4 text-[12.5px] text-steel-500">
              <Link to="/blog" className="hover:underline">{t("blog.title")}</Link>
            </nav>
            <div className="mb-3">{chip}</div>
            <h1 className="mb-3 text-3xl heading sm:text-4xl">{title}</h1>
            {excerpt && <p className="mb-4 text-[16px] text-ink/70">{excerpt}</p>}
            <div className="text-steel-500">{meta}</div>
          </div>
          {post.coverImage && <img src={post.coverImage} alt={post.coverAlt || ""} className="block h-auto w-full rounded-2xl" />}
        </header>
      ) : (
        <header className={clsx("container-page pt-10 sm:pt-14", wide ? "max-w-5xl" : "max-w-3xl")}>
          <nav className="mb-4 text-[12.5px] text-steel-500">
            <Link to="/blog" className="hover:underline">{t("blog.title")}</Link>
          </nav>
          <div className="mb-3">{chip}</div>
          <h1 className="mb-3 text-3xl heading sm:text-4xl">{title}</h1>
          {excerpt && <p className="mb-4 text-[16px] text-ink/70">{excerpt}</p>}
          <div className="mb-6 text-steel-500">{meta}</div>
          {post.coverImage && <img src={post.coverImage} alt={post.coverAlt || ""} className="block h-auto w-full rounded-2xl" />}
        </header>
      )}

      <div className={clsx("container-page py-8 sm:py-12", wide ? "max-w-5xl" : "max-w-3xl")}>
        <div className={clsx(wide && "mx-auto max-w-3xl")}>
          <BlogBlocks blocks={blocks} wide={wide} />
        </div>
      </div>

      {post.showProducts && products && products.length > 0 && (
        <Reveal as="section" className="container-page pb-12">
          <h2 className="mb-5 text-xl heading sm:text-2xl">{t("blog.productsTitle")}</h2>
          <ProductCarousel products={products} />
        </Reveal>
      )}

      {related.length > 0 && (
        <section className="border-t border-line bg-steel-50 py-12">
          <div className="container-page">
            <h2 className="mb-5 text-xl heading sm:text-2xl">{t("blog.related")}</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => (
                <BlogCard key={p.id} post={p} />
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
