"use client"

import { useParams } from "next/navigation"

import LawyersView from "@/components/views/lawyers-view"
import { useViewProps } from "@/components/layout/app-session"

/** Opens the lawyer list with that lawyer's detail panel showing. */
export default function LawyerDetailPage() {
  const { id } = useParams<{ id: string }>()
  return <LawyersView {...useViewProps({ id })} />
}
