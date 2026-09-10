"use client"

import DocumentsView from "@/components/views/documents-view"
import { useViewProps } from "@/components/layout/app-session"

export default function DocumentsPage() {
  return <DocumentsView {...useViewProps()} />
}
