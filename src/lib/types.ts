// Shared frontend types mirroring the AinSheba API contract (see worklog.md).
// All dates are ISO strings serialized from the API. Fields a list variant may
// omit are optional (`?`) — always access defensively.

export type Role = "ADMIN" | "LAWYER" | "CLIENT" | "STAFF"

export interface SessionUser {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  status: string
  lawyerProfile: { id: string; name: string; specialization: string | null } | null
  clientProfile: { id: string; name: string } | null
}

/* ------------------------------- Cases ------------------------------- */

export interface CaseListDTO {
  id: string
  caseNumber: string
  title: string
  type: string
  status: string
  priority: string
  court: string
  district: string | null
  filingDate: string | null
  oppositeParty: string | null
  client: { id: string; name: string; phone: string | null }
  lawyer: { id: string; name: string } | null
  nextHearingDate: string | null
  lastUpdate: string | null
  createdAt: string
}

export interface DocumentDTO {
  id: string
  caseId: string
  documentName: string
  documentType: string | null
  category: string | null
  fileName: string
  fileSize: number
  mimeType: string
  sharedWithClient: boolean
  uploadedByName: string | null
  createdAt: string
}

export interface HearingDTO {
  id: string
  caseId: string
  caseNumber: string
  caseTitle: string
  hearingDate: string
  court: string | null
  judge: string | null
  hearingType: string | null
  status: string
  notes: string | null
  summary: string | null
  courtOrder: string | null
  nextAction: string | null
  nextHearingDate: string | null
  createdAt: string
}

export interface UpdateDTO {
  id: string
  caseId: string
  update: string
  createdByName: string | null
  createdAt: string
}

/* ------------------------------ Billing ------------------------------ */

export interface PaymentDTO {
  id: string
  invoiceId: string
  invoiceNumber?: string | null
  caseNumber?: string | null
  clientName?: string | null
  amount: number
  paymentMethod: string
  paymentDate: string | null
  referenceNumber: string | null
  notes: string | null
  receivedByName: string | null
  createdAt: string
}

export interface InvoiceDTO {
  id: string
  invoiceNumber: string
  caseId: string | null
  caseNumber?: string | null
  caseTitle?: string | null
  clientId: string
  clientName: string
  billingType: string | null
  description: string | null
  amount: number
  paidAmount: number
  dueDate: string | null
  status: string
  payments?: PaymentDTO[]
  createdAt: string
}

export interface CaseDetailDTO extends CaseListDTO {
  description: string | null
  resolutionSummary: string | null
  outcome: string | null
  closedAt: string | null
  documents: DocumentDTO[]
  hearings: HearingDTO[]
  updates: UpdateDTO[]
  /** [] for STAFF (no financial access) */
  invoices: InvoiceDTO[]
}

/* ---------------------------- People / users ---------------------------- */

export interface ClientDTO {
  id: string
  userId: string | null
  name: string
  phone: string | null
  email: string | null
  nid: string | null
  address: string | null
  clientType: string | null
  caseCount: number
  activeCaseCount: number
  portalEmail?: string | null
  createdAt: string
}

export interface LawyerDTO {
  id: string
  userId: string | null
  name: string
  phone: string | null
  email: string | null
  barCouncilId: string | null
  specialization: string | null
  chamberName: string | null
  experience: number | null
  status: string
  totalCases: number
  activeCases: number
  createdAt: string
}

export interface UserDTO {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  status: string
  createdAt: string
  linkedName?: string | null
}

/* ---------------------------- Notifications ---------------------------- */

export interface NotificationDTO {
  id: string
  title: string
  message: string
  type: string // HEARING | BILLING | CASE | INFO
  caseId: string | null
  link: string | null // e.g. "case-detail:<caseId>"
  isRead: boolean
  createdAt: string
}

/* ------------------------------ Dashboard ------------------------------ */

export interface RecentActivity {
  id: string
  kind: string // CASE | HEARING | PAYMENT | UPDATE | DOCUMENT
  title: string
  description?: string | null
  createdAt: string
}

export interface CaseUpdateItem {
  id: string
  caseId: string
  caseNumber: string
  caseTitle: string
  update: string
  createdByName: string | null
  createdAt: string
}

/** Loose, role-aware dashboard payload from GET /api/dashboard. */
export interface DashboardDTO {
  role: string
  // Most values are numbers; the CLIENT payload returns nextHearingDate as an ISO string.
  stats: Record<string, number | string | null>
  todaysHearings?: HearingDTO[]
  upcomingHearings?: HearingDTO[]
  recentActivities?: RecentActivity[]
  myCases?: CaseListDTO[]
  recentCases?: CaseListDTO[]
  nextHearing?: HearingDTO | null
  recentUpdates?: CaseUpdateItem[]
  outstandingInvoices?: InvoiceDTO[]
}

/* ------------------------------- Reports ------------------------------- */

export interface ReportsDTO {
  caseReports: {
    total: number
    active: number
    pending: number
    onHold: number
    resolved: number
    closed: number
    byType: { type: string; count: number }[]
    byStatus: { status: string; count: number }[]
    byLawyer: { lawyerId: string; lawyerName: string; total: number; active: number; closed: number }[]
  }
  financial: {
    totalInvoiced: number
    totalCollected: number
    outstanding: number
    invoiceCount: number
    paymentCount: number
    byMethod: { method: string; amount: number }[]
  }
  hearingReports: {
    todays: number
    upcoming7: number
    completed: number
    adjourned: number
    thisMonth: number
  }
}

/* ------------------------------- Audit log ------------------------------- */

/** Field diff attached to some audit entries — { field: { from, to } }. */
export interface AuditMetaDiff {
  [field: string]: { from: unknown; to: unknown }
}

export interface AuditEntry {
  id: string
  actorId: string | null
  actorName: string | null
  actorRole: string | null
  action: string
  entityType: string | null
  entityId: string | null
  entityLabel: string | null
  summary: string | null
  meta: AuditMetaDiff | null
  createdAt: string
}

export interface AuditListDTO {
  items: AuditEntry[]
  total: number
  page: number
  pageSize: number
}

/* ---------------------------- SMS/Email bridge ---------------------------- */

export type OutboundEventKey =
  | "HEARING_TODAY"
  | "HEARING_TOMORROW"
  | "HEARING_SCHEDULED"
  | "HEARING_UPDATED"
  | "INVOICE_ISSUED"
  | "INVOICE_OVERDUE"
  | "PAYMENT_RECEIVED"

export interface OutboundSettingsDTO {
  smsEnabled: boolean
  emailEnabled: boolean
  events: Record<OutboundEventKey, boolean>
}

export interface OutboundMessageDTO {
  id: string
  channel: string // SMS | EMAIL
  recipient: string
  recipientName: string | null
  userId: string | null
  event: string
  body: string
  caseId: string | null
  caseNumber: string | null
  status: string // PENDING | SENT | SIMULATED | FAILED
  providerRef: string | null
  error: string | null
  attempts: number
  sentAt: string | null
  dedupeKey: string | null
  createdAt: string
}

export interface OutboundProviderStatusDTO {
  sms: "live" | "simulated"
  email: "live" | "simulated"
  smsProviderUrl: string | null
  emailProviderUrl: string | null
}

/** GET /api/outbound payload — items + counters + bridge settings + provider status. */
export interface OutboundListDTO {
  items: OutboundMessageDTO[]
  stats: Record<string, number>
  settings: OutboundSettingsDTO
  providers: OutboundProviderStatusDTO
}

/** POST /api/outbound/sweep payload. */
export interface ReminderSweepResult {
  ranAt: string
  today: { hearings: number; notified: number }
  tomorrow: { hearings: number; notified: number }
}

/** POST /api/outbound/[id]/retry payload. */
export interface OutboundRetryResult {
  ok: boolean
  status: string
  error?: string | null
}

/* ---------------------------- SPA view system ---------------------------- */

export type ViewKey =
  | "dashboard"
  | "cases"
  | "case-detail"
  | "clients"
  | "lawyers"
  | "hearings"
  | "documents"
  | "billing"
  | "notifications"
  | "reports"
  | "settings"
  | "audit"

export type ViewParams = Record<string, string>

/** Props every SPA view receives from AppShell. */
export interface ViewProps {
  user: SessionUser
  navigate: (view: ViewKey, params?: ViewParams) => void
  params: ViewParams
}
