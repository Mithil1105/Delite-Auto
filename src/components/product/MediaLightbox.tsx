import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import clsx from "clsx";
import type { ProductMedia } from "../../data/types";
import { EmbeddedVideo } from "./EmbeddedVideo";

const MAX_ZOOM = 4;
const MIN_ZOOM = 1;

/**
 * Full-screen media viewer for the product gallery — zoom (wheel / double-click / pinch / buttons),
 * drag-pan, prev/next, swipe, keyboard (arrows / Esc), focus-trapped. Ported from the Hasto
 * storefront's MediaLightbox (images + native video only; Odoo products have no embedded video).
 * Portalled to <body> so a sticky/transformed ancestor can never trap its stacking context.
 */
export function MediaLightbox({
  media,
  index,
  onIndexChange,
  onClose,
  productName,
}: {
  media: ProductMedia[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  productName: string;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const current = media[index];
  const count = media.length;

  const go = useCallback((dir: 1 | -1) => onIndexChange((index + dir + count) % count), [index, count, onIndexChange]);

  // Focus: remember the opener, focus Close, restore on unmount.
  useEffect(() => {
    const opener = document.activeElement;
    closeBtnRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Tab") {
        const focusables = overlayRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!current) return null;

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${productName} — media viewer`}
      className="fixed inset-0 z-[100] flex flex-col bg-black"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white/80">
        <span className="text-[12px] tracking-wide tabular-nums">
          {index + 1} / {count}
        </span>
        <button ref={closeBtnRef} type="button" onClick={onClose} aria-label="Close viewer" className="p-2 rounded-full transition hover:bg-white/10">
          <X size={20} strokeWidth={1.6} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {count > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous image"
            className="absolute left-2 z-10 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 md:left-5"
          >
            <ChevronLeft size={22} strokeWidth={1.6} />
          </button>
        )}

        {current.video ? (
          <div className="w-[min(92vw,1100px)]">
            {/* key={index}: moving to another slide unmounts the player, which stops playback */}
            <EmbeddedVideo key={index} video={current.video} poster={current.thumbnail || current.src} title={current.alt || productName} active className="rounded-xl" />
          </div>
        ) : current.type === "image" ? (
          <ZoomableImage key={index} src={current.src} alt={current.alt || productName} onSwipe={go} onClose={onClose} />
        ) : (
          <video src={current.src} controls playsInline className="max-h-[80vh] max-w-[92vw]" aria-label={current.alt || productName} />
        )}

        {count > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next image"
            className="absolute right-2 z-10 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20 md:right-5"
          >
            <ChevronRight size={22} strokeWidth={1.6} />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="flex justify-center gap-2 overflow-x-auto px-4 py-3" style={{ scrollbarWidth: "none" }}>
          {media.map((m, i) => (
            <button
              key={m.id + i}
              type="button"
              onClick={() => onIndexChange(i)}
              aria-label={`View image ${i + 1}`}
              aria-current={i === index}
              className={clsx(
                "relative h-12 w-12 shrink-0 overflow-hidden rounded-md border transition",
                i === index ? "border-white" : "border-white/25 opacity-60 hover:opacity-100"
              )}
            >
              <img src={m.thumbnail || m.src} alt="" className="h-full w-full object-cover" loading="lazy" />
              {m.video && <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/30 text-[10px] text-white">▶</span>}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

/** Wheel / double-click / pinch zoom + drag-pan. Remounted per image so zoom resets. */
function ZoomableImage({ src, alt, onSwipe, onClose }: { src: string; alt: string; onSwipe: (dir: 1 | -1) => void; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const touch = useRef<{ startX: number; startDist: number; startScale: number } | null>(null);

  const clampScale = (s: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s));

  const zoomBy = (delta: number) => {
    setScale((s) => {
      const next = clampScale(Math.round((s + delta) * 100) / 100);
      if (next === 1) setPos({ x: 0, y: 0 });
      return next;
    });
  };

  const onWheel = (e: React.WheelEvent) => zoomBy(-e.deltaY * 0.002);

  const onDoubleClick = () => {
    if (scale > 1) {
      setScale(1);
      setPos({ x: 0, y: 0 });
    } else {
      setScale(2);
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
    const move = (ev: MouseEvent) => {
      if (!drag.current) return;
      setPos({ x: drag.current.ox + (ev.clientX - drag.current.x), y: drag.current.oy + (ev.clientY - drag.current.y) });
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touch.current = { startX: 0, startDist: Math.hypot(dx, dy), startScale: scale };
    } else if (e.touches.length === 1) {
      touch.current = { startX: e.touches[0].clientX, startDist: 0, startScale: scale };
      if (scale > 1) drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: pos.x, oy: pos.y };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touch.current?.startDist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setScale(clampScale(touch.current.startScale * (Math.hypot(dx, dy) / touch.current.startDist)));
    } else if (e.touches.length === 1 && scale > 1 && drag.current) {
      setPos({ x: drag.current.ox + (e.touches[0].clientX - drag.current.x), y: drag.current.oy + (e.touches[0].clientY - drag.current.y) });
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    // Swipe to navigate only when not zoomed.
    if (scale <= 1 && touch.current) {
      const dx = (e.changedTouches[0]?.clientX ?? touch.current.startX) - touch.current.startX;
      if (Math.abs(dx) > 60) onSwipe(dx < 0 ? 1 : -1);
    }
    drag.current = null;
    touch.current = null;
  };

  return (
    <div
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onClick={(e) => {
        if (e.target === e.currentTarget && scale === 1) onClose();
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-[78vh] max-w-[92vw] select-none object-contain transition-transform duration-100"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`, cursor: scale > 1 ? "grab" : "zoom-in" }}
      />
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/10 px-1 py-1 backdrop-blur-sm">
        <button type="button" onClick={() => zoomBy(-0.5)} disabled={scale <= MIN_ZOOM} aria-label="Zoom out" className="rounded-full p-1.5 text-white transition hover:bg-white/15 disabled:opacity-30">
          <ZoomOut size={16} strokeWidth={1.6} />
        </button>
        <span className="w-9 text-center text-[10px] tabular-nums text-white/70">{scale.toFixed(1)}×</span>
        <button type="button" onClick={() => zoomBy(0.5)} disabled={scale >= MAX_ZOOM} aria-label="Zoom in" className="rounded-full p-1.5 text-white transition hover:bg-white/15 disabled:opacity-30">
          <ZoomIn size={16} strokeWidth={1.6} />
        </button>
      </div>
    </div>
  );
}
