import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { callApi } from "./transport";
import { currentPortalSlug } from "./portalHost";

export interface PortalBrand {
  slug: string;
  displayName: string;
  logoPath: string | null;
  coverPath: string | null;
  accentColor: string;
  tagline: string | null;
  welcomeText: string | null;
}

/** `none` = the shared portal address; `missing` = a dealer address that doesn't exist (or isn't live). */
type BrandState = { status: "loading" } | { status: "none" } | { status: "missing" } | { status: "ready"; brand: PortalBrand };

const Ctx = createContext<BrandState>({ status: "none" });

export function PortalBrandProvider({ children }: { children: ReactNode }) {
  const slug = currentPortalSlug();
  const [state, setState] = useState<BrandState>(slug ? { status: "loading" } : { status: "none" });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    callApi<{ brand: PortalBrand }>("dealer-portal", "public.brand", { slug })
      .then((r) => !cancelled && setState({ status: "ready", brand: r.brand }))
      .catch(() => !cancelled && setState({ status: "missing" }));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const usePortalBrand = () => useContext(Ctx);
