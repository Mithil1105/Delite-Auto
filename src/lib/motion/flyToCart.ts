/**
 * "Add to cart" flight: a copy of the product image arcs from where the shopper clicked to the
 * header cart icon, which then pops. Purely visual — called from CartContext.addToCart after the
 * real cart mutation, so it can never affect cart state. Skipped for `prefers-reduced-motion`;
 * silently does nothing if the source image or the cart icon can't be found.
 *
 * The click source is read from the native event that is currently being dispatched
 * (`window.event`), falling back to the focused element, so no call site has to pass anything:
 *   - a product card  → its [data-product-card] image
 *   - the product page → the visible image inside [data-pdp-gallery]
 * The target is the visible element carrying [data-cart-target] (the header cart button).
 */

function visibleRect(el: Element | null): DOMRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return null;
  if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null;
  return r;
}

function findSourceImage(origin: Element | null): HTMLImageElement | null {
  const card = origin?.closest("[data-product-card]");
  if (card) {
    const img = card.querySelector("img");
    if (img && visibleRect(img)) return img;
  }
  const gallery = document.querySelector("[data-pdp-gallery]");
  if (gallery) {
    const imgs = Array.from(gallery.querySelectorAll("img"));
    // Desktop stage keeps every slide mounted (cross-fade), so prefer the one marked visible.
    const shown = imgs.find((img) => !img.closest('[aria-hidden="true"]') && visibleRect(img) && getComputedStyle(img).visibility !== "hidden");
    if (shown) return shown;
  }
  return null;
}

function findCartTarget(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-cart-target]")).find((el) => visibleRect(el)) ?? null;
}

function popTarget(target: HTMLElement) {
  target.animate(
    [{ transform: "scale(1)" }, { transform: "scale(1.28)", offset: 0.35 }, { transform: "scale(0.94)", offset: 0.7 }, { transform: "scale(1)" }],
    { duration: 480, easing: "ease-out" }
  );
}

/** Returns true when a flight was started (so the caller can hold back anything that would cover the cart icon). */
export function flyToCart(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;

  const target = findCartTarget();
  if (!target) return false;

  const evt = (window as unknown as { event?: Event }).event;
  const origin = evt?.target instanceof Element ? evt.target : document.activeElement;
  const source = findSourceImage(origin);
  const from = visibleRect(source);
  const to = target.getBoundingClientRect();
  if (!source || !from) {
    popTarget(target);
    return false;
  }

  // Start from a capped square centred on the source, so a big gallery image doesn't fly at full size.
  const size = Math.min(from.width, from.height, 200);
  const startX = from.left + from.width / 2 - size / 2;
  const startY = from.top + from.height / 2 - size / 2;
  const dx = to.left + to.width / 2 - (startX + size / 2);
  const dy = to.top + to.height / 2 - (startY + size / 2);

  const ghost = document.createElement("img");
  ghost.src = source.currentSrc || source.src;
  ghost.alt = "";
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${startX}px`,
    top: `${startY}px`,
    width: `${size}px`,
    height: `${size}px`,
    objectFit: "cover",
    borderRadius: "16px",
    boxShadow: "0 12px 32px rgba(19,27,51,.28)",
    pointerEvents: "none",
    zIndex: "200",
    willChange: "transform, opacity",
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(ghost);

  const flight = ghost.animate(
    [
      { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) scale(0.55)`, opacity: 0.95, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.1)`, opacity: 0.25 },
    ],
    { duration: 720, easing: "cubic-bezier(0.55, 0, 0.7, 0.4)", fill: "forwards" }
  );
  const done = () => {
    ghost.remove();
    popTarget(target);
  };
  flight.onfinish = done;
  flight.oncancel = () => ghost.remove();
  return true;
}

/** How long the flight takes — CartContext waits this long before sliding the cart drawer over the icon. */
export const FLY_TO_CART_MS = 720;
