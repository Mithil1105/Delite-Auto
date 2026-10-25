import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import clsx from "clsx";
import { FullBleedSection } from "../layout/FullBleedSection";
import { ProductCarousel } from "../product/ProductCarousel";
import { useMerchandisedProducts } from "../../hooks/useMerchandisingCms";
import { getPostById } from "../../services/blog/blogService";
import { isLive, pickText, safeImageUrl, type BlogPost } from "../../lib/blog";
import { useLang } from "../../i18n/LanguageContext";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const link = (v: unknown): string => {
  const s = str(v);
  return s.startsWith("/") && !s.startsWith("//") ? s : /^https:\/\//.test(s) ? s : "";
};

/** Loads the blog post a block was pointed at (only if it is live); null when none / not found. */
function useLinkedPost(postId: string): BlogPost | null {
  const [post, setPost] = useState<BlogPost | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!postId) {
      setPost(null);
      return;
    }
    getPostById(postId).then((p) => !cancelled && setPost(p && isLive(p) ? p : null));
    return () => {
      cancelled = true;
    };
  }, [postId]);
  return post;
}

/**
 * A home page feature block: label, big heading, paragraph, optional button and a picture side by side (stacked on
 * phones), optionally followed by a product row. Everything comes from the admin (Website → Homepage → this block). If a
 * blog post is picked, any field left empty falls back to that post (category → label, title, summary, cover picture,
 * "Read article" button to the post) in the reader's language. With nothing to show it renders nothing.
 */
export function HomeFeatureBlock({ content }: { content?: Record<string, unknown> }) {
  const { t, lang } = useLang();
  const post = useLinkedPost(str(content?.postId));
  const ids = Array.isArray(content?.productIds) ? (content!.productIds as unknown[]).filter((id): id is number => Number.isSafeInteger(id) && (id as number) > 0).slice(0, 8) : [];
  const { products } = useMerchandisedProducts(ids);

  const eyebrow = str(content?.eyebrow) || post?.category || "";
  const title = str(content?.title) || (post ? pickText(post.title, lang) : "");
  const text = str(content?.text) || (post ? pickText(post.excerpt, lang) : "");
  const image = safeImageUrl(content?.image) || safeImageUrl(post?.coverImage) || null;
  const imageAlt = str(content?.imageAlt) || post?.coverAlt || title;
  const buttonLabel = str(content?.buttonLabel) || (post && !link(content?.buttonLink) ? t("blog.readMore") : "");
  const buttonLink = link(content?.buttonLink) || (post ? `/blog/${post.slug}` : "");

  const side = content?.imageSide === "left" ? "left" : "right";
  const bg = content?.background === "grey" ? "grey" : content?.background === "dark" ? "dark" : "white";
  const fit = content?.imageFit === "cover" ? "cover" : "contain";
  // Feature flag: "plain page content" drops the card look (no background, no picture box, no rounded corners) so the
  // block reads as part of the page itself rather than a separate card.
  const plain = content?.plain === true;
  const dark = bg === "dark" && !plain;

  if (!title && !image) return null;

  const button =
    buttonLabel && buttonLink ? (
      buttonLink.startsWith("/") ? (
        <Link to={buttonLink} className={clsx("mt-6 inline-flex w-fit", dark ? "btn-pill-gold" : "btn-pill-dark")}>{buttonLabel}</Link>
      ) : (
        <a href={buttonLink} target="_blank" rel="noopener noreferrer" className={clsx("mt-6 inline-flex w-fit", dark ? "btn-pill-gold" : "btn-pill-dark")}>{buttonLabel}</a>
      )
    ) : null;

  const productsTitle = str(content?.productsTitle);
  const productsLink = link(content?.productsLink);

  return (
    <FullBleedSection spacing={plain ? "compact" : "normal"} containerSize="wide" className={clsx(!plain && bg === "grey" && "bg-steel-50", dark && "bg-charcoal-deep text-white")}>
      <div className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
        <div className={clsx("flex flex-col", side === "left" && "md:order-2")}>
          {eyebrow && <div className={clsx("mb-3 text-lg font-semibold sm:text-xl", dark ? "text-white/90" : "text-ink")}>– {eyebrow}</div>}
          {title && <h2 className="text-3xl leading-[1.1] heading sm:text-5xl">{title}</h2>}
          {text && <p className={clsx("mt-4 max-w-[52ch] whitespace-pre-line text-[16px] leading-relaxed", dark ? "text-white/75" : "text-ink/75")}>{text}</p>}
          {button}
        </div>
        {image && (
          <div className={clsx(!plain && "overflow-hidden rounded-2xl", !plain && fit === "contain" && (dark ? "bg-white/10 p-6" : "bg-steel-100 p-6"))}>
            <img
              src={image}
              alt={imageAlt}
              loading="lazy"
              decoding="async"
              className={clsx("block w-full", fit === "contain" ? "aspect-[4/3] object-contain" : clsx("aspect-[4/3] object-cover", !plain && "rounded-2xl"))}
            />
          </div>
        )}
      </div>

      {ids.length > 0 && products && products.length > 0 && (
        <div className="mt-12">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h3 className="text-xl heading sm:text-2xl">{productsTitle || t("home.trendingAccessoriesTitle")}</h3>
            {productsLink && (
              <Link to={productsLink} className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] font-semibold hover:underline", dark ? "text-white" : "text-ink")}>
                {t("home.viewAll")} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
          <ProductCarousel products={products} />
        </div>
      )}
    </FullBleedSection>
  );
}
