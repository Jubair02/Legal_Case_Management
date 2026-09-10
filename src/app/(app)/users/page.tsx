"use client"

import SettingsView from "@/components/views/settings-view"
import { useViewProps } from "@/components/layout/app-session"

/** User management (ADMIN) — the settings tab as a real page. */
export default function UsersPage() {
  return <SettingsView {...useViewProps({ tab: "users" })} />
}
