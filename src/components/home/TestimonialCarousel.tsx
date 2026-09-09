import { Star } from "lucide-react";
import { testimonials } from "../../data/testimonials";
import { Rail, RailItem } from "../Rail";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const avatarPalette = ["bg-brand-600", "bg-accent", "bg-badge-new", "bg-gold-600", "bg-steel-700"];

/**
 * Home-page testimonial carousel matching the Figma redesign. Avatars are initials-in-circle,
 * not photos — see the "missing assets" note in Documentations MD/figma-homepage-redesign.md.
 */
export function TestimonialCarousel() {
  return (
    <Rail>
      {testimonials.map((t, i) => (
        <RailItem key={t.name} className="w-[260px] sm:w-[280px]">
          <figure className="card-surface rounded-2xl p-5 flex flex-col h-full">
            <div className="flex text-gold mb-3">
              {Array.from({ length: 5 }).map((_, s) => (
                <Star key={s} className="w-3.5 h-3.5 fill-gold" />
              ))}
            </div>
            <blockquote className="text-[13.5px] leading-relaxed text-ink/85 flex-1">&ldquo;{t.quote}&rdquo;</blockquote>
            <figcaption className="mt-4 pt-4 border-t border-line flex flex-col items-center text-center gap-1">
              <span className={`grid place-items-center w-9 h-9 rounded-full text-white text-[12px] font-semibold shrink-0 mb-1 ${avatarPalette[i % avatarPalette.length]}`}>
                {initials(t.name)}
              </span>
              <div className="font-semibold text-[13px]">{t.name}</div>
              <div className="text-[11.5px] text-steel-500">{t.productLabel ?? t.vehicle}</div>
            </figcaption>
          </figure>
        </RailItem>
      ))}
    </Rail>
  );
}
