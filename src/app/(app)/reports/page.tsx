"use client"

import ReportsView from "@/components/views/reports-view"
import { useViewProps } from "@/components/layout/app-session"

export default function ReportsPage() {
  return <ReportsView {...useViewProps()} />
}
