"use client"

import DashboardView from "@/components/dashboard/dashboard-view"
import { useViewProps } from "@/components/layout/app-session"

export default function DashboardPage() {
  return <DashboardView {...useViewProps()} />
}
