"use client"

import { Search, X } from "lucide-react"
import type { ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { useLanguage } from "@/lib/i18n/language"

/**
 * Shared filter-bar chrome for the chamber design system.
 *
 * The card-framed toolbar started on the hearings page and is now used by
 * billing and the client roster; it lives here so the list surfaces cannot
 * drift apart. See the surface primitives (`u-rise`) in globals.css.
 */

/** Card-framed filter bar with an optional live-region count line beneath it. */
export function Toolbar({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div
      className="u-rise rounded-xl border border-border/80 bg-card p-3 shadow-soft"
      style={{ "--d": "60ms" } as React.CSSProperties}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">{children}</div>
      {note ? (
        <p className="mt-2.5 px-1 text-xs text-muted-foreground" aria-live="polite">
          {note}
        </p>
      ) : null}
    </div>
  )
}

export interface SearchFieldProps {
  value: string
  onChange: (next: string) => void
  placeholder: string
  ariaLabel: string
  /** Tailwind width at `lg` and up; the field is full-width below that. */
  className?: string
}

/** Search input with a leading glyph and a clear button once it has content. */
export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className = "lg:w-80",
}: SearchFieldProps) {
  const { t } = useLanguage()
  return (
    <div className={`relative ${className}`}>
      <Search aria-hidden className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        placeholder={placeholder}
        className="pr-9 pl-9"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("common.clearSearch")}
          className="absolute top-1/2 right-1.5 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-paper-shade hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/** Micro-caps label over its value — the read-only counterpart to a form field. */
export function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="u-eyebrow text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-sm text-ink">{children}</div>
    </div>
  )
}
