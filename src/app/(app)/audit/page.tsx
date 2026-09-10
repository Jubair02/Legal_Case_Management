"use client"

import AuditView from "@/components/views/audit-view"
import { useViewProps } from "@/components/layout/app-session"

export default function AuditPage() {
  return <AuditView {...useViewProps()} />
}
