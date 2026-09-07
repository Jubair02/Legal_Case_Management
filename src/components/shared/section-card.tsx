"use client"

import type { ReactNode } from "react"

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export interface SectionCardProps {
  title: string
  description?: string
  children: ReactNode
  /** Rendered top-right of the header (e.g. "View all" button). */
  action?: ReactNode
  className?: string
}

/** White content section: CardHeader (title/description/action) + CardContent. */
export function SectionCard({ title, description, children, action, className }: SectionCardProps) {
  return (
    <Card className={cn("border-stone-200/80", className)}>
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
