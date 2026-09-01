import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type Translations } from "./en";
import { hi } from "./hi";
import { gu } from "./gu";

export type Lang = "en" | "hi" | "gu";

const dictionaries: Record<Lang, Translations> = { en, hi, gu };

export const languageMeta: { code: Lang; label: string; nativeLabel: string }[] = [
  { code: "en", label: "English", nativeLabel: "EN" },
  { code: "hi", label: "Hindi", nativeLabel: "हिं" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજ" },
];

const STORAGE_KEY = "delite-auto-lang";

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(str: string, vars?: Record<string, string | number>) {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  dict: Translations;
  t: (path: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function loadLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "hi" || stored === "gu") return stored;
  } catch {
    /* ignore */
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const dict = dictionaries[lang];

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) => {
      const value = getByPath(dict, path) ?? getByPath(en, path);
      if (typeof value !== "string") return path;
      return interpolate(value, vars);
    },
    [dict]
  );

  const value = useMemo(() => ({ lang, setLang, dict, t }), [lang, setLang, dict, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
