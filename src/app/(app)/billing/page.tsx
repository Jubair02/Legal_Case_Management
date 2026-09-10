"use client"

import BillingView from "@/components/views/billing-view"
import { useViewProps } from "@/components/layout/app-session"

/** Invoices tab of the billing view, at its own address. */
export default function BillingPage() {
  return <BillingView {...useViewProps({ tab: "invoices" })} />
}
