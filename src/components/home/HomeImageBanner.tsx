import { Link } from "react-router-dom";
import { FullBleedSection } from "../layout/FullBleedSection";

/** Banner image URLs come from the admin media library (https or a site-relative path) — anything else is ignored. */
const safeImage = (v: unknown): string | null => (typeof v === "string" && (v.startsWith("https://") || (v.startsWith("/") && !v.startsWith("//"))) ? v : null);
const safeLink = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.startsWith("/") && !s.startsWith("//") ? s : /^https:\/\//.test(s) ? s : null;
};

/**
 * A landscape image space on the home page. The picture comes only from the admin (Website → Homepage → this
 * section) — with no image set it renders nothing, so an empty slot never leaves a gap. The image is shown at its
 * own proportions (full width, height follows), so it never crops or stretches on any screen, mobile included.
 */
export function HomeImageBanner({ content }: { content?: Record<string, unknown> }) {
  const src = safeImage(content?.image);
  if (!src) return null;
  const alt = typeof content?.alt === "string" ? content.alt : "";
  const link = safeLink(content?.link);
  const img = <img src={src} alt={alt} loading="lazy" decoding="async" className="block h-auto w-full rounded-xl sm:rounded-2xl" />;

  return (
    <FullBleedSection spacing="compact" containerSize="wide">
      {link ? (
        link.startsWith("/") ? (
          <Link to={link} className="block" aria-label={alt || undefined}>{img}</Link>
        ) : (
          <a href={link} target="_blank" rel="noopener noreferrer" className="block" aria-label={alt || undefined}>{img}</a>
        )
      ) : (
        img
      )}
    </FullBleedSection>
  );
}
