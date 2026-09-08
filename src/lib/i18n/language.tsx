"use client"

/**
 * Minimal i18n runtime for AinSheba.
 *
 * - `LanguageProvider` holds the active language (default "en"), hydrates it
 *   from localStorage (`lcm_lang`) on mount and mirrors it onto
 *   `document.documentElement.lang` (globals.css switches the Bangla font on
 *   `html[lang="bn"]`).
 * - `useLanguage()` exposes `{ lang, setLang, t }`. `t(key, vars)` looks up
 *   dict[lang] → dict.en → key, then interpolates `{name}`-style placeholders.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { bnCore, enCore } from "./dictionaries-core"
import { bnViews, enViews } from "./dictionaries-views"

const en: Record<string, string> = { ...enCore, ...enViews }
const bn: Record<string, string> = { ...bnCore, ...bnViews }

const DICTS: Record<Lang, Record<string, string>> = { en, bn }

const STORAGE_KEY = "lcm_lang"

export type Lang = "en" | "bn"

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

function isLang(value: unknown): value is Lang {
  return value === "en" || value === "bn"
}

interface LanguageContextValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: TranslateFn
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en")

  // Hydrate the persisted choice once on mount (one-time external-store read;
  // kept synchronous so the very first paint already uses the chosen language).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate one-time hydration from localStorage
      if (isLang(stored)) setLangState(stored)
    } catch {
      /* localStorage unavailable — keep default */
    }
  }, [])

  // Keep <html lang> in sync (font switching + a11y).
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore persistence failures */
    }
  }, [])

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      let value = DICTS[lang][key] ?? DICTS.en[key] ?? key
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          value = value.split(`{${name}}`).join(String(replacement))
        }
      }
      return value
    },
    [lang]
  )

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider")
  return ctx
}

/**
 * Builds the `status.*` dictionary key for an incoming status/priority/role/
 * type value: "ON_HOLD" → "status.onHold", "URGENT" → "status.urgent".
 */
export function statusTKey(value: string): string {
  const parts = value.toLowerCase().split("_").filter(Boolean)
  const camel = parts
    .map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("")
  return `status.${camel}`
}

/**
 * Translates a status-like value via `status.*`, falling back to the raw value
 * (underscores rendered as spaces) when no dictionary entry exists.
 */
export function statusLabel(value: string, t: TranslateFn): string {
  const key = statusTKey(value)
  const translated = t(key)
  return translated === key ? value.replace(/_/g, " ") : translated
}
