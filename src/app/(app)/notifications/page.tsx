"use client"

import NotificationsView from "@/components/views/notifications-view"
import { useViewProps } from "@/components/layout/app-session"

export default function NotificationsPage() {
  return <NotificationsView {...useViewProps()} />
}
