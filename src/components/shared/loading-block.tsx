"use client"

import { Skeleton } from "@/components/ui/skeleton"

export interface LoadingBlockProps {
  /** Number of skeleton rows per list panel (default 2). */
  rows?: number
  /** Number of metric tiles in the top grid (default 3). */
  tiles?: number
  /** Number of list panels below the tiles (default 1). */
  panels?: number
  /**
   * Adds a title/description skeleton on top. Off by default — most views
   * render their real `PageHeader` above this and would double up.
   */
  header?: boolean
}

/**
 * Loading placeholder shaped like the real content — metric tiles over list
 * panels — so the first paint does not reflow once data lands.
 */
export function LoadingBlock({ rows = 2, tiles = 3, panels = 1, header = false }: LoadingBlockProps) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      {header ? (
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-44" />
        </div>
      ) : null}

      <div
        className={
          tiles >= 4
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {Array.from({ length: tiles }).map((_, i) => (
          <div
            key={i}
            className="flex items-start justify-between gap-4 rounded-xl border border-border/80 bg-card p-5 shadow-soft"
          >
            <div className="space-y-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        ))}
      </div>

      <div className={panels > 1 ? "grid grid-cols-1 gap-6 lg:grid-cols-2" : "grid grid-cols-1 gap-6"}>
        {Array.from({ length: panels }).map((_, p) => (
          <div key={p} className="rounded-xl border border-border/80 bg-card shadow-soft">
            <div className="space-y-2 px-5 pb-4 pt-5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="mx-5 h-px bg-border/70" />
            <div className="space-y-3 px-5 py-4">
              {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
