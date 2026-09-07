"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  /** Optional CTA rendered below the text. */
  action?: ReactNode
}

/** Centered muted placeholder used when lists/panels have nothing to show. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-200 bg-white/60 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
