import { useState, useRef, useEffect } from "react";
import { Languages, Check } from "lucide-react";
import { useLang, languageMeta } from "../i18n/LanguageContext";
import clsx from "clsx";

export function LanguageSwitcher({ light = false }: { light?: boolean }) {
  const { lang, setLang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = languageMeta.find((l) => l.code === lang) ?? languageMeta[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        className={clsx(
          "flex items-center gap-1.5 h-9 px-2.5 text-[12.5px] font-semibold border transition-colors",
          light ? "border-white/20 text-white/80 hover:text-white hover:border-white/40" : "border-line text-ink/70 hover:text-ink hover:border-ink"
        )}
      >
        <Languages className="w-3.5 h-3.5" />
        {current.nativeLabel}
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute right-0 mt-1.5 w-40 bg-white border border-line shadow-lift z-50 py-1"
        >
          {languageMeta.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === lang}
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[13.5px] text-ink hover:bg-steel-50 text-left"
              >
                <span>
                  {l.nativeLabel} <span className="text-steel-500 text-[11.5px]">· {l.label}</span>
                </span>
                {l.code === lang && <Check className="w-3.5 h-3.5 text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
