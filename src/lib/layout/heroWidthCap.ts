/** Shared "don't stretch across a huge/ultra-wide monitor" cap used by both Hero.tsx (the hero
 * photo itself, where it's computed in JS from the real container box) and Header.tsx (the nav
 * row, via plain CSS so it tracks the same boundary without needing to read Hero's own state) — a
 * single source of truth so the two can never drift apart and the nav visually lines up with the
 * hero's own capped-width content instead of spanning into its blurred backdrop margins. See
 * Hero.tsx's own doc comment for why this exists (ultra-wide monitors over-zooming the photo). */
export const MAX_HERO_ASPECT = 2.2;

/** CSS `max-width` expressing the same cap as `MAX_HERO_ASPECT`, in pure CSS (`vh` approximates
 * the real viewport height Hero.tsx measures via `getBoundingClientRect` closely enough for
 * visual alignment) — for elements that need to match Hero's cap without their own JS/ResizeObserver. */
export const HERO_WIDTH_CAP_CSS = `min(100%, ${MAX_HERO_ASPECT * 100}vh)`;
