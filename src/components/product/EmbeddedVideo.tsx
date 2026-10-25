import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import clsx from "clsx";
import type { ProductVideo } from "../../data/types";

const PROVIDER_NAME: Record<ProductVideo["provider"], string> = { youtube: "YouTube", vimeo: "Vimeo", other: "the video site" };

/** The player URL with autoplay on (the shopper has just pressed Play). */
function playerSrc(embedUrl: string): string {
  try {
    const url = new URL(embedUrl);
    url.searchParams.set("autoplay", "1");
    return url.toString();
  } catch {
    return embedUrl;
  }
}

/**
 * A product video from Odoo (YouTube / Vimeo link). It starts as a poster with a Play button — nothing
 * is loaded from the video site until the shopper presses Play (faster page, and no tracking cookies
 * before they choose to watch). Playing runs the embedded player right here; "Watch on YouTube" always
 * opens the video on its own site in a new tab. Providers we can't embed safely just get the link.
 * `active` is whether this is the slide currently on show — moving to another image stops the video.
 */
export function EmbeddedVideo({ video, poster, title, active, className }: { video: ProductVideo; poster?: string; title: string; active: boolean; className?: string }) {
  const [playing, setPlaying] = useState(false);
  // Leaving the slide ends playback (the iframe is unmounted), and coming back starts from the poster again.
  if (!active && playing) setPlaying(false);

  const provider = PROVIDER_NAME[video.provider];
  const canEmbed = !!video.embedUrl;
  const linkLabel = video.provider === "other" ? "Watch video" : `Watch on ${provider}`;

  return (
    <div className={clsx("flex h-full w-full flex-col items-center justify-center gap-3 bg-ink p-3", className)}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {playing && active && video.embedUrl ? (
          <iframe
            src={playerSrc(video.embedUrl)}
            title={title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <>
            {poster ? (
              <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" loading="lazy" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-steel-800 to-black" aria-hidden />
            )}
            {canEmbed ? (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                aria-label={`Play video: ${title}`}
                className="absolute inset-0 grid place-items-center transition-colors hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
              >
                <span className="grid h-16 w-16 place-items-center rounded-full bg-white/95 text-ink shadow-lift transition-transform hover:scale-105">
                  <Play className="ml-1 h-7 w-7" fill="currentColor" />
                </span>
              </button>
            ) : (
              <a
                href={video.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${linkLabel}: ${title}`}
                className="absolute inset-0 grid place-items-center transition-colors hover:bg-black/10"
              >
                <span className="grid h-16 w-16 place-items-center rounded-full bg-white/95 text-ink shadow-lift">
                  <Play className="ml-1 h-7 w-7" fill="currentColor" />
                </span>
              </a>
            )}
          </>
        )}
      </div>
      <a href={video.watchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/85 underline-offset-2 hover:text-white hover:underline">
        {linkLabel} <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
