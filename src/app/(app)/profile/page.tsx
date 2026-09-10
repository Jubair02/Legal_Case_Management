"use client"

import SettingsView from "@/components/views/settings-view"
import { useViewProps } from "@/components/layout/app-session"

/** The "My Account" tab of settings, linkable on its own. */
export default function ProfilePage() {
  return <SettingsView {...useViewProps({ tab: "account" })} />
}
