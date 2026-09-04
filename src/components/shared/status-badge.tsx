"use client"

import { Badge } from "@/components/ui/badge"
import { cn, type StatusStyle } from "@/lib/utils"

const FALLBACK_STYLE: StatusStyle = {
  label: "",
  className: "bg-stone-100 text-stone-600 border-stone-200",
}

export interface StatusBadgeProps {
  /** Style map, e.g. `caseStatusStyles` from `@/lib/utils` (each `{ label, className }`). */
  map: Record<string, StatusStyle>
  value: string | null | undefined
  className?: string
}

/**
 * Renders a shadcn outline Badge using the matching style-map entry.
 * Unknown/missing values fall back to a stone badge with the raw value
 * (underscores rendered as spaces).
 */
export function StatusBadge({ map, value, className }: StatusBadgeProps) {
  const style = (value && map[value]) || FALLBACK_STYLE
  const label = style.label || (value ? value.replace(/_/g, " ") : "—")
  return (
    <Badge variant="outline" className={cn("border", style.className, className)}>
      {label}
    </Badge>
  )
}
