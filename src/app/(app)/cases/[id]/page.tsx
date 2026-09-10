"use client"

import { useParams } from "next/navigation"

import CaseDetailView from "@/components/views/case-detail-view"
import { useViewProps } from "@/components/layout/app-session"

/** Each case file has its own shareable URL: /cases/<id>. */
export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>()
  return <CaseDetailView {...useViewProps({ id })} />
}
