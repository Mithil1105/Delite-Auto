import { useEffect, useState } from "react";

/**
 * Generic reusable media-query hook — avoids scattering `window.innerWidth` checks through
 * components. Used for the cart drawer's 700px breakpoint (deliberately not Tailwind's `md`,
 * which is 768px — see Documentations MD/responsive-cart-drawer.md).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handleChange = () => setMatches(mql.matches);
    handleChange();
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, [query]);

  return matches;
}
