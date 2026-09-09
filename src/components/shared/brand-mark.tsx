"use client"

import { useId } from "react"

import { cn } from "@/lib/utils"

/**
 * AinSheba's balance-scale mark.
 *
 * This is the same artwork as the browser favicon (src/app/icon.svg), so the
 * tab icon and the in-app logo are one mark rather than two lookalikes. It is
 * drawn on a 32-unit grid with stroke weights heavy enough to survive a 16px
 * favicon, which is why the beam and column are chunkier than a typical
 * line icon.
 */
export function BrandMark({ className }: { className?: string }) {
  // Unique per instance: several marks can render on the same page (sidebar,
  // mobile header) and duplicate gradient ids would collide.
  const gradientId = useId()

  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="AinSheba"
      className={cn("h-10 w-10 rounded-[22%]", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0aa876" />
          <stop offset="1" stopColor="#05815f" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill={`url(#${gradientId})`} />
      <g fill="#ffffff">
        <circle cx="16" cy="6.2" r="2.1" />
        <rect x="4" y="7.8" width="24" height="3" rx="1.5" />
        <rect x="14.5" y="8.6" width="3" height="14.4" rx="1.5" />
        <path d="M9.2 26.4 L11.9 22.6 L20.1 22.6 L22.8 26.4 Z" />
        <rect x="5.85" y="10.6" width="2" height="3.6" />
        <path d="M2.05 14 A4.8 3.5 0 0 0 11.65 14 Z" />
        <rect x="24.15" y="10.6" width="2" height="3.6" />
        <path d="M20.35 14 A4.8 3.5 0 0 0 29.95 14 Z" />
      </g>
    </svg>
  )
}
