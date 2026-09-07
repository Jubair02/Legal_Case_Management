"use client"

import { Skeleton } from "@/components/ui/skeleton"

export interface LoadingBlockProps {
  /** Number of skeleton rows in the lower list card (default 2). */
  rows?: number
}

/** Loading placeholder: 3 stat-card skeletons + a list card with row skeletons. */
export function LoadingBlock({ rows = 2 }: LoadingBlockProps) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-xl border border-stone-200/80 bg-white p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-stone-200/80 bg-white p-6">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
