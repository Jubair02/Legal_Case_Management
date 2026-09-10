"use client"

import { useParams } from "next/navigation"

import ClientsView from "@/components/views/clients-view"
import { useViewProps } from "@/components/layout/app-session"

/** Opens the client list with that client's detail panel showing. */
export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  return <ClientsView {...useViewProps({ id })} />
}
