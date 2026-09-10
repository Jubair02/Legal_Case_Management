"use client"

import HearingsView from "@/components/views/hearings-view"
import { useViewProps } from "@/components/layout/app-session"

export default function HearingsPage() {
  return <HearingsView {...useViewProps()} />
}
