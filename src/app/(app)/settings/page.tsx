"use client"

import SettingsView from "@/components/views/settings-view"
import { useViewProps } from "@/components/layout/app-session"

export default function SettingsPage() {
  return <SettingsView {...useViewProps()} />
}
