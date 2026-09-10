"use client"

import ClientsView from "@/components/views/clients-view"
import { useViewProps } from "@/components/layout/app-session"

export default function ClientsPage() {
  return <ClientsView {...useViewProps()} />
}
