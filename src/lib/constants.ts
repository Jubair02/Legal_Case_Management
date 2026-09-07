// Domain constants for AinSheba — Legal Case Management (Bangladesh)

export const ROLES = ["ADMIN", "LAWYER", "CLIENT", "STAFF"] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  LAWYER: "Lawyer / Advocate",
  CLIENT: "Client",
  STAFF: "Staff / Clerk",
}

export const CASE_TYPES = [
  "Civil Case",
  "Criminal Case",
  "Family Case",
  "Land / Property Case",
  "Labour Case",
  "Company / Commercial Case",
  "Cyber Crime Case",
  "Writ Petition",
  "Bail Matter",
  "Other",
] as const

export const CASE_STATUSES = ["DRAFT", "ACTIVE", "PENDING", "ON_HOLD", "RESOLVED", "CLOSED"] as const

export const CASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Active",
  PENDING: "Pending",
  ON_HOLD: "On Hold",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
}

export const CASE_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
}

export const COURTS = [
  "Supreme Court of Bangladesh",
  "High Court Division",
  "Appellate Division",
  "District & Sessions Judge Court",
  "Chief Judicial Magistrate Court",
  "Metropolitan Magistrate Court",
  "Metropolitan Sessions Judge Court",
  "Family Court",
  "Labour Court",
  "Cyber Tribunal",
  "Artha Rin Adalat (Money Loan Court)",
  "Income Tax Appellate Tribunal",
  "Administrative Tribunal",
  "Other Court",
] as const

export const DISTRICTS = [
  "Dhaka",
  "Chattogram",
  "Khulna",
  "Rajshahi",
  "Sylhet",
  "Barishal",
  "Rangpur",
  "Mymensingh",
  "Cumilla",
  "Narayanganj",
  "Gazipur",
  "Bogura",
  "Jashore",
  "Cox's Bazar",
  "Other",
] as const

export const HEARING_TYPES = [
  "Regular Hearing",
  "Bail Hearing",
  "Framing of Charge",
  "Order Date",
  "Judgment",
  "Evidence / Deposition",
  "Argument",
  "Adjournment Request",
  "Miscellaneous",
] as const

export const HEARING_STATUSES = ["UPCOMING", "COMPLETED", "ADJOURNED", "POSTPONED", "CANCELLED"] as const

export const HEARING_STATUS_LABELS: Record<string, string> = {
  UPCOMING: "Upcoming",
  COMPLETED: "Completed",
  ADJOURNED: "Adjourned",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
}

export const DOCUMENT_TYPES = [
  "Vakalatnama",
  "Petition",
  "Written Statement",
  "FIR / GD Copy",
  "Court Order",
  "Judgment",
  "Evidence",
  "NID / Supporting Documents",
  "Agreement",
  "Other",
] as const

export const DOCUMENT_CATEGORIES = ["Legal Documents", "Client Documents", "Court Orders", "Evidence"] as const

export const BILLING_TYPES = [
  "Consultation Fee",
  "Case Filing Fee",
  "Lawyer Fee",
  "Court Fee",
  "Documentation Fee",
  "Other Expenses",
] as const

export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "bKash", "Nagad", "Rocket"] as const

export const INVOICE_STATUSES = ["UNPAID", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"] as const

export const SPECIALIZATIONS = [
  "Criminal Law",
  "Civil Law",
  "Family Law",
  "Corporate Law",
  "Land Law",
  "Cyber Law",
] as const

export const CLIENT_TYPES = ["INDIVIDUAL", "COMPANY", "ORGANIZATION"] as const

export const CLIENT_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  COMPANY: "Company",
  ORGANIZATION: "Organization",
}

/** File upload limits */
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export const ALLOWED_MIME_PREFIXES = [
  "application/pdf",
  "image/",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml",
  "text/plain",
]

/**
 * File-picker hint mirroring ALLOWED_MIME_PREFIXES while excluding active
 * content the server rejects (SVG/HTML). Extensions are listed explicitly
 * because `image/*` would also offer .svg files.
 */
export const UPLOAD_ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,.txt"

/** App brand */
export const APP_NAME = "AinSheba"
export const APP_NAME_BN = "আইনসেবা"
export const APP_TAGLINE = "Legal Case Management — Bangladesh"
export const CURRENCY_SYMBOL = "৳"
