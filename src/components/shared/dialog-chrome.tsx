"use client"

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * Shared dialog/form chrome for the chamber design system.
 *
 * These three pieces were written for the hearings dialogs and are now used by
 * billing too; they live here so the two cannot drift apart. See the surface
 * primitives (`u-eyebrow`, `u-rule`) in globals.css.
 */

export interface DialogHeadProps {
  icon: LucideIcon
  title: string
  description: string
}

/** Icon-plate dialog header, matching the SectionCard header on the dashboard. */
export function DialogHead({ icon: Icon, title, description }: DialogHeadProps) {
  return (
    <DialogHeader>
      <div className="flex items-start gap-3 text-left">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
          <Icon className="h-[1.15rem] w-[1.15rem]" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <DialogTitle className="font-serif text-xl leading-tight font-semibold tracking-tight text-ink">
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </div>
      </div>
    </DialogHeader>
  )
}

/** Micro-caps section label over a fading brass rule — groups the long forms. */
export function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <h3 className="u-eyebrow shrink-0 text-brass-deep">{label}</h3>
        <span aria-hidden className="u-rule flex-1" />
      </div>
      {children}
    </section>
  )
}

export function RequiredMark() {
  return <span className="text-rose-500">*</span>
}
