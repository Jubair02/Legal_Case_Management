"use client"

import type { ReactNode } from "react"

export interface PageHeaderProps {
  title: string
  description?: string
  /** Rendered on the right side (action buttons, tabs, etc.). */
  children?: ReactNode
}

/**
 * Page title block: serif display title over a muted description, with
 * optional right-side actions. The serif is the app-wide heading voice —
 * see `--serif-stack` in globals.css.
 */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-ink md:text-[1.75rem]">
          {title}
        </h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}
