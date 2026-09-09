"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface SectionCardProps {
  title: string
  description?: string
  children: ReactNode
  /** Rendered top-right of the header (e.g. "View all" button). */
  action?: ReactNode
  /** Optional glyph in a tinted plate left of the title. */
  icon?: LucideIcon
  /** Draws a brass hairline down the left edge — use for the one panel that matters most. */
  accent?: boolean
  className?: string
  /** Staggered entrance delay in ms (see `.u-rise` in globals.css). */
  delay?: number
}

/**
 * White content panel: serif title, optional icon plate and action, a hairline
 * rule separating header from body. The serif/sans split is deliberate — the
 * heading carries the voice, the body carries the data.
 */
export function SectionCard({
  title,
  description,
  children,
  action,
  icon: Icon,
  accent = false,
  className,
  delay = 0,
}: SectionCardProps) {
  return (
    <section
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
      className={cn(
        "u-rise relative flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft",
        className
      )}
    >
      {accent ? (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-brass/70 via-brass/30 to-transparent"
        />
      ) : null}

      <header className="flex items-start gap-3 px-5 pb-4 pt-5">
        {Icon ? (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-lg font-semibold leading-tight tracking-tight text-ink">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>

      <div aria-hidden className="mx-5 h-px bg-border/70" />

      <div className="flex-1 px-5 py-4">{children}</div>
    </section>
  )
}
