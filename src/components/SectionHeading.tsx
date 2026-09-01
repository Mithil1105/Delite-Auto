import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function SectionHeading({
  eyebrow,
  title,
  description,
  cta,
  ctaHref,
  dark = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  cta?: string;
  ctaHref?: string;
  dark?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
      <div>
        {eyebrow && <span className="eyebrow mb-2">{eyebrow}</span>}
        <h2 className={`text-2xl sm:text-3xl font-semibold ${dark ? "text-white" : "text-ink"}`}>{title}</h2>
        {description && <p className={`mt-2 max-w-[60ch] text-[14.5px] ${dark ? "text-white/65" : "text-steel-500"}`}>{description}</p>}
      </div>
      {cta && ctaHref && (
        <Link
          to={ctaHref}
          className={`inline-flex items-center gap-1.5 font-mono text-[12.5px] uppercase tracking-widish shrink-0 group ${
            dark ? "text-white" : "text-ink"
          }`}
        >
          {cta}
          <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
