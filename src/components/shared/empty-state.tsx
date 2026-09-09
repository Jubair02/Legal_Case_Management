"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  /** Optional CTA rendered below the text. */
  action?: ReactNode
  /**
   * `inline` is the in-panel variant: no border, tighter, for a list that has
   * nothing in it yet. Default `block` is the full-width page placeholder.
   */
  variant?: "block" | "inline"
  className?: string
}

/** Centered placeholder used when lists/panels have nothing to show. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = "block",
  className,
}: EmptyStateProps) {
  const inline = variant === "inline"

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        inline
          ? "gap-2 px-4 py-8"
          : "gap-2.5 rounded-xl border border-dashed border-border bg-paper-shade/60 px-6 py-14",
        className
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full bg-emerald-50 text-emerald-700/70 ring-1 ring-emerald-600/10",
          inline ? "h-9 w-9" : "h-12 w-12"
        )}
      >
        <Icon className={inline ? "h-[1.15rem] w-[1.15rem]" : "h-5 w-5"} />
      </span>
      <p className={cn("font-medium text-foreground", inline ? "text-[0.8125rem]" : "text-sm")}>{title}</p>
      {description ? (
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
