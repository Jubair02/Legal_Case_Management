"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  /** May be async; errors are toasted and keep the dialog open. */
  onConfirm: () => Promise<void> | void
  destructive?: boolean
}

/** AlertDialog with built-in pending state + error toast around `onConfirm`. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false)

  const handleConfirm = async () => {
    try {
      setPending(true)
      await onConfirm()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(destructive && "bg-destructive text-white hover:bg-destructive/90")}
            disabled={pending}
            onClick={(e) => {
              e.preventDefault() // keep dialog open while pending
              void handleConfirm()
            }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
