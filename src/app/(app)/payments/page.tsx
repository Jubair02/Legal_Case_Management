"use client"

import BillingView from "@/components/views/billing-view"
import { useViewProps } from "@/components/layout/app-session"

/** Payments tab of the billing view, at its own address. */
export default function PaymentsPage() {
  return <BillingView {...useViewProps({ tab: "payments" })} />
}
