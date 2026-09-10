"use client"

import CasesView from "@/components/views/cases-view"
import { useViewProps } from "@/components/layout/app-session"

export default function CasesPage() {
  return <CasesView {...useViewProps()} />
}
