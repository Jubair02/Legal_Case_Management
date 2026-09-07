import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const DHAKA_TZ = "Asia/Dhaka"

/** Format ৳ BDT amount with South-Asian grouping: ৳1,50,000.00 */
export function formatCurrency(amount: number | null | undefined): string {
  const n = typeof amount === "number" && !Number.isNaN(amount) ? amount : 0
  return `৳${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)}`
}

/** "12 Feb 2026" in Asia/Dhaka */
export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—"
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date)
}

/** "12 Feb 2026, 10:30 AM" in Asia/Dhaka */
export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—"
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date)
}

/** "Today", "Tomorrow", "Yesterday" or "12 Feb 2026" (Dhaka). */
export function formatRelativeDay(d: string | Date | null | undefined): string {
  if (!d) return "—"
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return "—"
  const key = (x: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: DHAKA_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(x)
  const diff =
    (Date.parse(key(date)) - Date.parse(key(new Date()))) / (24 * 60 * 60 * 1000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff === -1) return "Yesterday"
  return formatDate(date)
}

/** "Today · 04 Sept 2026" (Dhaka) — avoids duplication for ordinary dates. */
export function formatDayLabel(d: string | Date | null | undefined): string {
  const rel = formatRelativeDay(d)
  const full = formatDate(d)
  return rel === full ? full : `${rel} · ${full}`
}

/** "2026-02-12" for <input type="date"> values (Dhaka). */
export function toDateInputValue(d: string | Date | null | undefined): string {
  if (!d) return ""
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

export interface StatusStyle {
  label: string
  className: string
}

/** Tailwind classes for case status badges (no indigo/blue). */
export const caseStatusStyles: Record<string, StatusStyle> = {
  DRAFT: { label: "Draft", className: "bg-stone-100 text-stone-700 border-stone-200" },
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  PENDING: { label: "Pending", className: "bg-amber-100 text-amber-800 border-amber-200" },
  ON_HOLD: { label: "On Hold", className: "bg-orange-100 text-orange-800 border-orange-200" },
  RESOLVED: { label: "Resolved", className: "bg-teal-100 text-teal-800 border-teal-200" },
  CLOSED: { label: "Closed", className: "bg-slate-100 text-slate-600 border-slate-200" },
}

export const priorityStyles: Record<string, StatusStyle> = {
  LOW: { label: "Low", className: "bg-stone-100 text-stone-600 border-stone-200" },
  MEDIUM: { label: "Medium", className: "bg-amber-100 text-amber-800 border-amber-200" },
  HIGH: { label: "High", className: "bg-orange-100 text-orange-800 border-orange-200" },
  URGENT: { label: "Urgent", className: "bg-rose-100 text-rose-700 border-rose-200" },
}

export const hearingStatusStyles: Record<string, StatusStyle> = {
  UPCOMING: { label: "Upcoming", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  COMPLETED: { label: "Completed", className: "bg-slate-100 text-slate-600 border-slate-200" },
  ADJOURNED: { label: "Adjourned", className: "bg-amber-100 text-amber-800 border-amber-200" },
  POSTPONED: { label: "Postponed", className: "bg-orange-100 text-orange-800 border-orange-200" },
  CANCELLED: { label: "Cancelled", className: "bg-rose-100 text-rose-700 border-rose-200" },
}

export const invoiceStatusStyles: Record<string, StatusStyle> = {
  UNPAID: { label: "Unpaid", className: "bg-amber-100 text-amber-800 border-amber-200" },
  PARTIAL: { label: "Partial", className: "bg-teal-100 text-teal-800 border-teal-200" },
  PAID: { label: "Paid", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  OVERDUE: { label: "Overdue", className: "bg-rose-100 text-rose-700 border-rose-200" },
  CANCELLED: { label: "Cancelled", className: "bg-slate-100 text-slate-600 border-slate-200" },
}

export const clientTypeStyles: Record<string, StatusStyle> = {
  INDIVIDUAL: { label: "Individual", className: "bg-stone-100 text-stone-700 border-stone-200" },
  COMPANY: { label: "Company", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  ORGANIZATION: { label: "Organization", className: "bg-teal-100 text-teal-800 border-teal-200" },
}
