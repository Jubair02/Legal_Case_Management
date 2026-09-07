"use client"

import type { ReactNode } from "react"

export interface PageHeaderProps {
  title: string
  description?: string
  /** Rendered on the right side (action buttons, tabs, etc.). */
  children?: ReactNode
}

/** Page title block: `text-xl md:text-2xl font-semibold tracking-tight` + optional right-side actions. */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}
