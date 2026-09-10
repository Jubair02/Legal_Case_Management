"use client"

import LawyersView from "@/components/views/lawyers-view"
import { useViewProps } from "@/components/layout/app-session"

export default function LawyersPage() {
  return <LawyersView {...useViewProps()} />
}
