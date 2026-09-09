"use client"

import { ArrowUpRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface Tone {
  /** Icon plate: tint + ring. */
  plate: string
  /** Corner bloom behind the plate. */
  bloom: string
}

const TONES: Record<string, Tone> = {
  emerald: { plate: "bg-emerald-50 text-emerald-700 ring-emerald-600/15", bloom: "bg-emerald-400/20" },
  amber: { plate: "bg-amber-50 text-amber-700 ring-amber-600/15", bloom: "bg-amber-400/20" },
  rose: { plate: "bg-rose-50 text-rose-700 ring-rose-600/15", bloom: "bg-rose-400/20" },
  teal: { plate: "bg-teal-50 text-teal-700 ring-teal-600/15", bloom: "bg-teal-400/20" },
  stone: { plate: "bg-stone-100 text-stone-600 ring-stone-500/15", bloom: "bg-stone-400/20" },
  gold: { plate: "bg-brass-tint text-brass-deep ring-brass/25", bloom: "bg-brass/25" },
}

export type StatTone = keyof typeof TONES

export interface StatCardProps {
  icon: LucideIcon
  label: string
  value: ReactNode
  sub?: string
  tone?: StatTone
  className?: string
  /**
   * Makes the tile a button that drills into the matching view. Tiles without
   * a handler stay inert `div`s — no hover affordance is drawn for them.
   */
  onClick?: () => void
  /** Accessible name for the drill-in; falls back to `label`. */
  actionLabel?: string
  /** Staggered entrance delay in ms (see `.u-rise` in globals.css). */
  delay?: number
}

/**
 * Metric tile: micro-caps label, tabular value, tinted icon plate, brass crest
 * hairline along the top edge and a soft tone bloom behind the plate.
 *
 * Numerals stay in the sans face on purpose — the serif is reserved for
 * headings so data reads as data and never as editorial voice.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "emerald",
  className,
  onClick,
  actionLabel,
  delay = 0,
}: StatCardProps) {
  const t = TONES[tone] ?? TONES.emerald
  const interactive = typeof onClick === "function"

  const body = (
    <>
      {/* top crest hairline — brighter in the middle, like a milled edge */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent"
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full blur-2xl transition-opacity duration-300",
          t.bloom,
          interactive && "group-hover:opacity-80"
        )}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="u-eyebrow text-muted-foreground">{label}</p>
          <p className="mt-2.5 truncate text-[1.75rem] font-semibold leading-none tracking-tight text-ink tabular-nums">
            {value}
          </p>
          {sub ? <p className="mt-2 truncate text-xs text-muted-foreground">{sub}</p> : null}
        </div>
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 transition-transform duration-300",
            t.plate,
            interactive && "group-hover:scale-105"
          )}
        >
          <Icon className="h-[1.15rem] w-[1.15rem]" />
        </span>
      </div>

      {interactive ? (
        <ArrowUpRight
          aria-hidden
          className="absolute bottom-4 right-4 h-4 w-4 text-brass-deep opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
        />
      ) : null}
    </>
  )

  const shell = cn(
    "group u-rise relative overflow-hidden rounded-xl border border-border/80 bg-card p-5 pb-6 shadow-soft",
    className
  )

  if (!interactive) {
    return (
      <div className={shell} style={{ "--d": `${delay}ms` } as React.CSSProperties}>
        {body}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={actionLabel ?? label}
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
      className={cn(
        shell,
        "w-full cursor-pointer text-left transition-[box-shadow,border-color,transform] duration-200",
        "hover:-translate-y-0.5 hover:border-emerald-600/25 hover:shadow-lift",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      )}
    >
      {body}
    </button>
  )
}
