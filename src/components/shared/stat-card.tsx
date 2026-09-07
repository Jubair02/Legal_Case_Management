"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const TONE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  teal: "bg-teal-100 text-teal-700",
  stone: "bg-stone-100 text-stone-600",
  gold: "bg-yellow-100 text-yellow-700",
}

export type StatTone = keyof typeof TONE_CLASSES

export interface StatCardProps {
  icon: LucideIcon
  label: string
  value: ReactNode
  sub?: string
  tone?: StatTone
  className?: string
}

/** White stat card: label, bold value, optional sub line, tinted icon square. */
export function StatCard({ icon: Icon, label, value, sub, tone = "emerald", className }: StatCardProps) {
  return (
    <Card className={cn("gap-0 border-stone-200/80 py-0 shadow-sm", className)}>
      <CardContent className="flex items-start justify-between gap-3 p-6">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-bold tracking-tight">{value}</p>
          {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        </div>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", TONE_CLASSES[tone])}>
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  )
}
