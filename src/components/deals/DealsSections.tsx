import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Clock, Copy, MessageCircle, Plus } from "lucide-react";
import { FullBleedSection } from "../layout/FullBleedSection";
import { ProductCarousel } from "../product/ProductCarousel";
import { ProductMedia } from "../product/ProductMedia";
import { CarModelGrid } from "../home/CarModelGrid";
import { BrandLogo } from "../brands/BrandLogo";
import { Reveal, staggerDelay } from "../motion/Reveal";
import { carModels } from "../../data/carModels";
import { site } from "../../data/site";
import type { Category, Product } from "../../data/types";
import { catalogService } from "../../services/catalog/catalogService";
import { useMerchandisedProducts, useMerchandisingCms } from "../../hooks/useMerchandisingCms";
import { useCart } from "../../context/CartContext";
import { supabase } from "../../lib/supabaseClient";
import { formatINR } from "../../lib/format";
import { productRequiresSelection } from "../../lib/recommendations/variants";
import {
  asIdList,
  asNumber,
  asString,
  budgetBandHref,
  countdownParts,
  isCampaignActive,
  parseBudgetBands,
  parseCombos,
  parseLocalDateTime,
  whatsappUrl,
} from "../../lib/deals/helpers";

/**
 * The Deals & Offers page's sections, keyed by section key (src/data/dealsSections.ts). Every
 * component takes the section's merged `content` (admin settings over the in-code defaults) and
 * hides itself (returns null) when it has nothing honest to show — e.g. an empty product list.
 * On/off, order and the editable settings come from the CMS; see src/pages/Deals.tsx and
 * Documentations MD/deals-and-offers-page.md.
 */

export type DealsSectionProps = { content: Record<string, unknown>; tone: "white" | "tint" };

function Shell({ title, tone, cta, children }: { title: string; tone: "white" | "tint"; cta?: { label: string; href: string }; children: ReactNode }) {
  return (
    <FullBleedSection spacing="normal" containerSize="wide" className={tone === "tint" ? "bg-steel-50" : "bg-white"}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl sm:text-3xl heading">{title}</h2>
        {cta && (
          <Link to={cta.href} className="whitespace-nowrap text-[13px] font-semibold text-brand-700 hover:underline">
            {cta.label}
          </Link>
        )}
      </div>
      {children}
    </FullBleedSection>
  );
}

function ProductRail({ title, tone, products, cta }: { title: string; tone: "white" | "tint"; products: Product[] | null | undefined; cta?: { label: string; href: string } }) {
  if (!products || products.length === 0) return null;
  return (
    <Shell title={title} tone={tone} cta={cta}>
      <ProductCarousel products={products} />
    </Shell>
  );
}

/* ───────── Message strip ───────── */

export function MessageStrip({ content }: DealsSectionProps) {
  const text = asString(content.text);
  const code = asString(content.code);
  const link = asString(content.link);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);
  if (!text) return null;

  const message = link.startsWith("/") && !link.startsWith("//") ? (
    <Link to={link} className="underline-offset-2 hover:underline">{text}</Link>
  ) : (
    <span>{text}</span>
  );
  return (
    <div className="bg-ink px-4 py-2.5 text-center text-[13px] text-white">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {message}
        {code && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(code).then(() => setCopied(true)).catch(() => {});
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/40 px-2.5 py-0.5 font-mono text-[12px] tracking-wide transition-colors hover:bg-white/10"
            aria-label={`Copy coupon code ${code}`}
          >
            {code}
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────── Top banner ───────── */

export function DealsHero({ content }: DealsSectionProps) {
  const image = asString(content.image);
  const mobileImage = asString(content.mobileImage);
  const ctaLink = asString(content.ctaLink);
  const internalLink = ctaLink.startsWith("/") && !ctaLink.startsWith("//");

  // "Image only": the client's own banner picture replaces the whole coloured banner.
  if (asString(content.style) === "image" && image) {
    const picture = (
      <picture>
        {mobileImage && <source media="(max-width: 639px)" srcSet={mobileImage} />}
        <img src={image} alt={asString(content.imageAlt) || asString(content.title) || "Deals and offers"} className="block h-auto w-full" fetchPriority="high" />
      </picture>
    );
    if (!ctaLink) return <section className="bg-white">{picture}</section>;
    return (
      <section className="bg-white">
        {internalLink ? <Link to={ctaLink} className="block">{picture}</Link> : <a href={ctaLink} className="block" rel="noreferrer">{picture}</a>}
      </section>
    );
  }

  const title = asString(content.title);
  const subtitle = asString(content.subtitle);
  const ctaLabel = asString(content.ctaLabel);
  const internal = internalLink;
  return (
    <section className="relative isolate overflow-hidden bg-brand-600 text-white">
      {image && <img src={image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-30" />}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-700/90 via-brand-600/80 to-brand-500/70" aria-hidden />
      <div className="container-wide py-14 sm:py-20">
        <div className="max-w-2xl">
          {title && <h1 className="text-4xl sm:text-5xl heading leading-[1.05]">{title}</h1>}
          {subtitle && <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-white/85 sm:text-[17px]">{subtitle}</p>}
          {ctaLabel && ctaLink && (
            <div className="mt-7">
              {internal ? (
                <Link to={ctaLink} className="btn-pill-gold">
                  {ctaLabel} <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <a href={ctaLink} className="btn-pill-gold" rel="noreferrer">
                  {ctaLabel} <ArrowRight className="h-4 w-4" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ───────── Timed campaign ───────── */

function useNow(intervalMs: number, enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

export function CampaignBanner({ content }: DealsSectionProps) {
  const end = parseLocalDateTime(content.endsAt);
  const showCountdown = content.showCountdown !== false && end !== undefined;
  const now = useNow(1000, showCountdown || end !== undefined || parseLocalDateTime(content.startsAt) !== undefined);
  const title = asString(content.title);
  const subtitle = asString(content.subtitle);
  const image = asString(content.image);
  const ctaLabel = asString(content.ctaLabel);
  const ctaLink = asString(content.ctaLink);
  if (!title || !isCampaignActive(content, now)) return null;

  const parts = end !== undefined ? countdownParts(end - now) : null;
  const units: [string, number][] = parts ? [["Days", parts.days], ["Hours", parts.hours], ["Mins", parts.minutes], ["Secs", parts.seconds]] : [];
  const internal = ctaLink.startsWith("/") && !ctaLink.startsWith("//");

  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-r from-gold to-gold-600 text-ink">
      {image && <img src={image} alt="" className="absolute inset-y-0 right-0 -z-10 h-full w-1/2 object-cover opacity-70 [mask-image:linear-gradient(to_left,black,transparent)]" />}
      <div className="container-wide flex flex-col gap-6 py-10 sm:py-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
            <Clock className="h-3.5 w-3.5" /> Limited time
          </span>
          <h2 className="text-3xl sm:text-4xl heading leading-tight">{title}</h2>
          {subtitle && <p className="mt-2 text-[15px] text-ink/80">{subtitle}</p>}
          {ctaLabel && ctaLink && (
            <div className="mt-5">
              {internal ? (
                <Link to={ctaLink} className="btn-pill-dark">{ctaLabel}</Link>
              ) : (
                <a href={ctaLink} className="btn-pill-dark" rel="noreferrer">{ctaLabel}</a>
              )}
            </div>
          )}
        </div>
        {showCountdown && parts && (
          <div role="timer" aria-label="Time left" className="flex gap-2.5">
            {units.map(([label, value]) => (
              <div key={label} className="grid min-w-[64px] place-items-center rounded-xl bg-ink px-3 py-3 text-white">
                <span className="font-mono text-2xl font-semibold tabular-nums">{String(value).padStart(2, "0")}</span>
                <span className="text-[10px] uppercase tracking-wide text-white/70">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ───────── Product lists ───────── */

export function HotPicks({ content, tone }: DealsSectionProps) {
  const { bySectionKey } = useMerchandisingCms();
  const own = asIdList(content.productIds, 12);
  const fallback = asIdList(bySectionKey.get("featured")?.content.productIds, 12);
  const { products } = useMerchandisedProducts(own.length > 0 ? own : fallback);
  return <ProductRail title={asString(content.title) || "Hot picks"} tone={tone} products={products} cta={{ label: "View all", href: "/shop" }} />;
}

export function NewArrivals({ content, tone }: DealsSectionProps) {
  const { bySectionKey } = useMerchandisingCms();
  const own = asIdList(content.productIds, 12);
  const fallback = asIdList(bySectionKey.get("new-arrivals")?.content.productIds, 12);
  const { products } = useMerchandisedProducts(own.length > 0 ? own : fallback);
  return <ProductRail title={asString(content.title) || "New arrivals"} tone={tone} products={products} cta={{ label: "View all", href: "/shop" }} />;
}

export function OfferCategory({ content, tone }: DealsSectionProps) {
  const categoryId = Number(content.categoryId);
  const validCategory = Number.isSafeInteger(categoryId) && categoryId > 0;
  const max = asNumber(content.maxItems, 12, 24);
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    if (!validCategory) return;
    let cancelled = false;
    catalogService
      .getProductsPage({ page: 1, pageSize: Math.min(max, 60), categoryId })
      .then((r) => {
        if (!cancelled) setProducts(r.items);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [categoryId, max, validCategory]);
  return <ProductRail title={asString(content.title) || "On offer"} tone={tone} products={validCategory ? products : []} cta={validCategory ? { label: "View all", href: `/shop?category=${categoryId}` } : undefined} />;
}

export function TopRated({ content, tone }: DealsSectionProps) {
  const minReviews = asNumber(content.minReviews, 5, 50);
  const includeDemo = content.includeDemo === true;
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .rpc("top_rated_products", { p_limit: 12, p_min_reviews: minReviews, p_include_seed: includeDemo })
      .then(({ data, error }) => {
        if (cancelled) return;
        setIds(error || !Array.isArray(data) ? [] : (data as { odoo_template_id: number }[]).map((r) => r.odoo_template_id));
      });
    return () => {
      cancelled = true;
    };
  }, [minReviews, includeDemo]);
  const { products } = useMerchandisedProducts(ids);
  return <ProductRail title={asString(content.title) || "Top rated by customers"} tone={tone} products={products} />;
}

/** Products priced below their original price (MRP), biggest percentage first. Empty until Odoo products carry an MRP. */
export function BiggestSavings({ content, tone }: DealsSectionProps) {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all: Product[] = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages && page <= 8) {
          const r = await catalogService.getProductsPage({ page, pageSize: 60 });
          totalPages = r.totalPages;
          all.push(...r.items);
          page++;
        }
        const pct = (p: Product) => (p.mrp && p.mrp > p.price ? (p.mrp - p.price) / p.mrp : 0);
        const onSale = all.filter((p) => pct(p) > 0).sort((a, b) => pct(b) - pct(a)).slice(0, 12);
        if (!cancelled) setProducts(onSale);
      } catch {
        if (!cancelled) setProducts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return <ProductRail title={asString(content.title) || "Biggest savings"} tone={tone} products={products} cta={{ label: "All sale items", href: "/shop?sale=1" }} />;
}

/* ───────── Shop by budget ───────── */

export function BudgetBands({ content, tone }: DealsSectionProps) {
  const bands = useMemo(() => parseBudgetBands(content.bands), [content.bands]);
  if (bands.length === 0) return null;
  return (
    <Shell title={asString(content.title) || "Shop by budget"} tone={tone}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {bands.slice(0, 10).map((b, i) => (
          <Reveal key={`${b.label}-${i}`} delay={staggerDelay(i, 45, 5)} className="h-full">
            <Link
              to={budgetBandHref(b)}
              className="group flex h-full items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-5 text-[15px] font-semibold transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-brand-600 hover:shadow-card motion-reduce:hover:translate-y-0"
            >
              {b.label}
              <ArrowRight className="h-4 w-4 shrink-0 text-ink/40 transition-all group-hover:translate-x-0.5 group-hover:text-brand-700" />
            </Link>
          </Reveal>
        ))}
      </div>
    </Shell>
  );
}

/* ───────── Offers for your car ───────── */

export function CarOffers({ content, tone }: DealsSectionProps) {
  const limit = asNumber(content.limit, 8, carModels.length);
  return (
    <Shell title={asString(content.title) || "Offers for your car"} tone={tone} cta={{ label: "See all cars", href: "/cars" }}>
      <CarModelGrid models={carModels.slice(0, limit)} />
    </Shell>
  );
}

/* ───────── Brand strip ───────── */

export function BrandStrip({ content, tone }: DealsSectionProps) {
  const limit = asNumber(content.limit, 12, 28);
  const [brands, setBrands] = useState<Category[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    catalogService
      .getCategories()
      .then((c) => {
        if (!cancelled) setBrands(c.filter((x) => x.role === "brand").sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0)));
      })
      .catch(() => {
        if (!cancelled) setBrands([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!brands || brands.length === 0) return null;
  return (
    <Shell title={asString(content.title) || "Shop by brand"} tone={tone} cta={{ label: "All brands", href: "/brands" }}>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {brands.slice(0, limit).map((b, i) => (
          <Reveal key={b.odooId} delay={staggerDelay(i, 40, 6)} className="h-full">
            <Link
              to={`/shop?brand=${b.odooId}`}
              aria-label={`${b.name} products`}
              className="group block h-full overflow-hidden rounded-2xl border border-line bg-white p-1.5 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-brand-600 hover:shadow-card motion-reduce:hover:translate-y-0"
            >
              <BrandLogo name={b.name} src={b.imageUrl} className="aspect-[4/3] p-2" />
            </Link>
          </Reveal>
        ))}
      </div>
    </Shell>
  );
}

/* ───────── Combo picks ───────── */

export function ComboPicks({ content, tone }: DealsSectionProps) {
  const combos = useMemo(() => parseCombos(content.combos), [content.combos]);
  const allIds = useMemo(() => Array.from(new Set(combos.flatMap((c) => c.productIds))), [combos]);
  const { products } = useMerchandisedProducts(allIds);
  const { addToCart } = useCart();
  const [addedKey, setAddedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!addedKey) return;
    const t = window.setTimeout(() => setAddedKey(null), 1800);
    return () => window.clearTimeout(t);
  }, [addedKey]);

  const byId = new Map((products ?? []).map((p) => [p.odooId, p]));
  const resolved = combos
    .map((c) => ({ ...c, items: c.productIds.map((id) => byId.get(id)).filter((p): p is Product => !!p) }))
    .filter((c) => c.items.length >= 2);
  if (resolved.length === 0) return null;

  return (
    <Shell title={asString(content.title) || "Combo picks"} tone={tone}>
      <div className="grid gap-5 md:grid-cols-2">
        {resolved.map((combo, ci) => {
          const total = combo.items.reduce((sum, p) => sum + p.price, 0);
          const needsChoice = combo.items.find(productRequiresSelection);
          const key = `${combo.title}-${ci}`;
          return (
            <Reveal key={key} delay={staggerDelay(ci, 70, 4)} className="h-full">
              <div className="flex h-full flex-col rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
                <h3 className="font-display text-lg uppercase">{combo.title}</h3>
                <div className="mt-4 flex flex-wrap items-stretch gap-2">
                  {combo.items.map((p, i) => (
                    <div key={p.id} className="flex items-center gap-2">
                      {i > 0 && <Plus className="h-4 w-4 shrink-0 text-steel-300" aria-hidden />}
                      <Link to={`/product/${p.slug}`} className="group block w-[104px] sm:w-[120px]">
                        <ProductMedia src={p.primaryImage} alt={p.name} icon={p.icon} className="aspect-square w-full rounded-xl border border-line" iconClassName="w-8 h-8" />
                        <div className="mt-1.5 line-clamp-2 text-[11.5px] font-medium leading-snug group-hover:text-brand-700">{p.name}</div>
                        <div className="price text-[12px] font-semibold text-steel-700">{formatINR(p.price)}</div>
                      </Link>
                    </div>
                  ))}
                </div>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-wide text-steel-500">Together</div>
                    <div className="price text-xl font-bold">{formatINR(total)}</div>
                  </div>
                  {needsChoice ? (
                    <Link to={`/product/${needsChoice.slug}`} className="btn-pill-outline">Choose options</Link>
                  ) : (
                    <button
                      type="button"
                      className="btn-pill-dark"
                      onClick={() => {
                        combo.items.forEach((p, i) => addToCart(p, 1, { feedback: i === combo.items.length - 1 }));
                        setAddedKey(key);
                      }}
                    >
                      {addedKey === key ? (<><Check className="h-4 w-4" /> Added</>) : "Add all to cart"}
                    </button>
                  )}
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Shell>
  );
}

/* ───────── WhatsApp quote CTA ───────── */

export function WhatsAppCta({ content }: DealsSectionProps) {
  const url = whatsappUrl(asString(content.number) || site.phone, asString(content.message));
  if (!url) return null;
  return (
    <FullBleedSection spacing="normal" containerSize="wide" className="bg-white">
      <div className="flex flex-col items-start justify-between gap-5 rounded-3xl bg-ink px-6 py-8 text-white sm:flex-row sm:items-center sm:px-10">
        <div className="max-w-xl">
          <h2 className="text-2xl sm:text-3xl heading leading-tight">{asString(content.title) || "Need a better price on a bigger order?"}</h2>
          {asString(content.text) && <p className="mt-2 text-[14.5px] text-white/75">{asString(content.text)}</p>}
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="btn-pill-gold shrink-0">
          <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
        </a>
      </div>
    </FullBleedSection>
  );
}

