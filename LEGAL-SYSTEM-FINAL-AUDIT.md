# LEGAL SYSTEM — FINAL AUDIT

**Project:** AinSheba (আইনসেবা) — Legal Case Management, Bangladesh
**Audit date:** 2026-09-10
**Companion document:** [`CURRENT-SYSTEM-AUDIT.md`](./CURRENT-SYSTEM-AUDIT.md) — discovery detail and the keep/change register
**Basis:** Static source review. No runtime execution, load testing or live penetration testing. Items that could not be confirmed from source are marked **UNVERIFIED**.

---

## 1. EXECUTIVE SUMMARY

AinSheba is a substantially complete, single-organisation legal practice-management system for Bangladeshi chambers. It covers the daily working loop end to end: intake → case → assignment → hearings → documents → billing → collection → client visibility.

**The system's quality is sharply uneven, in a way that is correctable.**

- **Domain and security logic is strong.** Exact-decimal money with server-authoritative calculation, transaction-safe payment recording, monotonic invoice numbering, revocable sessions, DB-backed brute-force protection, append-only audit trail, properly access-controlled document download with anti-XSS serving, and complete server-side upload validation. Several of these are fixes that only exist after someone thought adversarially — the source comments record the rejected alternatives.
- **Infrastructure and process are prototype-grade.** Zero automated tests across 30,000 lines. Documents on ephemeral local disk. A `setInterval` scheduler that produces N sweeps on N replicas and **zero** on serverless. No backups, no monitoring, no CI, no README.

**Three items block production.** None is architecturally hard; all are cheaper now than after a chamber trusts the system with real files.

**Commercially**, the product is narrower than it appears: there is no tenant boundary in the schema. This supports a per-chamber licence or managed hosting, not self-serve SaaS.

**Bangladesh suitability is the strongest single dimension** and the real moat — Bangla as architecture rather than translation, Bangladeshi court taxonomy, ৳ formatting, mobile-wallet vernacular, and Dhaka-correct date logic.

---

## 2. CURRENT ARCHITECTURE

Single Next.js 16 application. React 19 client views; App Router route handlers as the API; Prisma → PostgreSQL. Deployable self-hosted as a standalone Node server behind Caddy, or on Vercel (auto-detected, standalone bundle skipped there).

```
Client   React 19 views · Tailwind v4 + shadcn/ui · EN/BN dictionary · TanStack Query
   ↓
Edge     middleware route gate · JWT role read (no DB access) · CSP/HSTS/nosniff
   ↓
App      35 route handlers · requireAuth + RBAC · audit writer
         ⚠ in-process setInterval scheduler   · outbound bridge
   ↓
State    PostgreSQL (Prisma) · ⚠ local disk uploads/ · SMS HTTP gateway · Email webhook
```

⚠ marks the two components that prevent running a second instance.

**Deliberate architectural decisions worth preserving:** middleware is explicitly documented as UX and not the security boundary (the edge runtime cannot reach the database, so status and revocation checks live in `requireAuth`); the outbound bridge is a durable outbox rather than fire-and-forget; and the Bearer-token fallback for cookie-blocked iframes is off by default and documented in `.env` as an XSS→7-day-session risk.

**Score: 7 / 10** — clean layering and sound decisions, undermined by two single-instance dependencies.

---

## 3. CURRENT ROLES

Four roles exist: `ADMIN`, `LAWYER`, `STAFF`, `CLIENT` (Postgres enum).

Mapped against the role model proposed in the brief:

| Proposed role | Present? | Notes |
|---|---|---|
| SUPER ADMIN | **Merged into ADMIN** | No separation between system-level and organisation-level administration — acceptable in a single-organisation product, but blocks SaaS |
| FIRM / CHAMBER ADMIN | **= ADMIN** | Same role does both jobs |
| LAWYER / ADVOCATE | Yes | Scoped to assigned cases |
| PARALEGAL / LEGAL STAFF | **= STAFF** | Present and correctly restricted |
| CLIENT | Yes | Scoped to own matters |

**Assessment:** the four-role model is right for a single chamber. Introducing SUPER_ADMIN now would be premature complexity — it only becomes necessary alongside multi-tenancy (§19).

**Score: 8 / 10**

---

## 4. RBAC ASSESSMENT

Enforcement is layered in three places, and the layering is correct:

1. **Middleware** — route gate by JWT role. Explicitly documented as UX only.
2. **`requireAuth(roles?)`** — per-handler authentication + role gate, throwing 401/403.
3. **`lib/permissions.ts`** — per-record assertions (`assertCaseReadAccess`, `assertCaseWriteAccess`) and list scope filters (`caseScopeWhere`) that resolve the caller's lawyer/client profile before granting access.

### IDOR / BOLA verification

I swept all 35 handlers for the combination of authentication and ownership enforcement. **No IDOR was found.** Specific traces:

| Attack | Result |
|---|---|
| LAWYER requests another lawyer's case by id | `assertCaseWriteAccess` → 403 "This case is not assigned to you." |
| CLIENT requests another client's case by id | `assertCaseReadAccess` → 403 "This case does not belong to you." |
| CLIENT requests an unshared document by id | `sharedWithClient` gate → 403 |
| Any user guesses a document URL | `/api/files/[documentId]` runs full case-access + share checks before reading disk |
| CLIENT passes `?clientId=` to list payments | Ignored — "Clients are always locked to their own profile" |
| LAWYER records a payment on another's invoice | `inv.case?.lawyer?.userId !== user.id` → 403 |
| User marks another user's notification read | `notification.userId !== user.id` → 403 |
| Non-admin reaches reports / audit / users / outbound | `requireAuth(["ADMIN"])` → 403 |
| STAFF reaches any financial endpoint | Excluded from the role list → 403 (not merely hidden in UI) |
| Privilege escalation via signup | **No signup endpoint exists.** Role is set only by ADMIN via `requireEnum` against the allowlist |
| Mass assignment via PATCH | Every handler builds an explicit per-field `data` object; no body spread anywhere |

**Residual risk is not in the logic — it is that none of it is tested.** Twelve authorization branches across four roles, guarded entirely by code review.

**Score: 8 / 10** — logic sound, verification absent.

---

## 5. AUTHENTICATION ASSESSMENT

| Area | State |
|---|---|
| **Signup** | **Does not exist.** Admin-provisioned only — eliminates the whole role-escalation-at-signup class |
| Password hashing | `scryptSync`, 16-byte salt, `timingSafeEqual`. Cost params implicit, not stored, no rehash-on-login |
| Login | Constant-time via `DUMMY_HASH` for unknown emails; account status checked; rate-limited |
| Rate limiting | DB-backed dual-bucket, 8 attempts / 10 min, 5 min lockout |
| Session | JWT HS256 in httpOnly cookie, `SameSite=Lax`, `Secure` in production, 7-day expiry |
| Revocation | `sessionVersion` checked on every request; bumped on password change |
| Logout | Cookie cleared |
| Refresh | None — 7-day fixed expiry, then re-login |
| **Password reset** | **Missing entirely** |
| 2FA | Missing |
| Email verification | N/A — no self-service signup |
| CSRF | No token. Relies on `SameSite=Lax` + correct verb usage. Acceptable but thin; bypassed entirely in Bearer mode |
| localStorage token | Only in Bearer fallback mode, off by default, documented as an XSS risk |

**Score: 7 / 10** — strong primitives, two real gaps (reset, 2FA).

---

## 6. CASE MANAGEMENT ASSESSMENT

Lifecycle: `DRAFT → ACTIVE → PENDING / ON_HOLD → RESOLVED / CLOSED`.

**Closure is gated** — the API refuses `RESOLVED`/`CLOSED` without a resolution summary, so the outcome always lands in the file. This is a genuinely good business rule.

| Required field | Present | Notes |
|---|---|---|
| Case number | ✅ | Unique, free text |
| Case title | ✅ | |
| Case type | ✅ | Bangladeshi taxonomy, enum-validated |
| Court | ✅ | From `COURTS` list |
| **Division** | ❌ | Bangladesh's 8 administrative divisions are not modelled |
| **Jurisdiction** | ❌ | Not modelled |
| Filing date | ✅ | |
| **Filing information** | ⚠️ | Only a date — no filing reference, registry, or mode |
| Status | ✅ | Enum |
| Priority | ✅ | Enum |
| Client | ✅ | FK |
| Opposite party | ⚠️ | Free-text string, not an entity — so conflict checking is impossible |
| Assigned lawyer | ✅ | Nullable FK |
| Description | ✅ | |
| Next hearing | ✅ | Propagated from hearing outcomes |
| **Case timeline** | ⚠️ | Data exists across four tables; no unified chronological view |
| Notes | ⚠️ | `CaseUpdate` — single visibility, client-visible; no internal-only channel |
| Documents | ✅ | |
| **Orders / judgments** | ❌ | `courtOrder` is free text on a hearing; not a record |
| **Deadlines** | ❌ | Not modelled |

**Score: 7 / 10**

---

## 7. HEARING MANAGEMENT ASSESSMENT

| Field | State |
|---|---|
| Hearing date | ✅ `DateTime`, indexed |
| **Hearing time** | ⚠️ Same field. UI collapses the time gutter when nothing carries a real court time — handled gracefully, but time is not separately captured |
| Court | ✅ Defaults from the case |
| Case | ✅ FK, indexed |
| **Lawyer** | ❌ Not on the hearing — inherited from the case, so appearance-by-a-different-advocate cannot be recorded |
| Hearing type / purpose | ✅ |
| Result / outcome | ✅ Summary, court order, next action |
| Next hearing date | ✅ Propagates to the case |
| Notes | ✅ |
| Status | ✅ `UPCOMING / COMPLETED / ADJOURNED / POSTPONED / CANCELLED` — matches real cause-list vocabulary |

**Timezone: correct and notable.** Comparisons use `Asia/Dhaka` **day keys**, not timestamps, so a date-only hearing today never reads as past.

**Date validation:** dates are parsed and rejected if unparseable, but there is no business-rule validation — a hearing can be scheduled in the past, and `nextHearingDate` is not required to be after `hearingDate`.

**Score: 7 / 10**

---

## 8. CLIENT MANAGEMENT ASSESSMENT

Profile, contact details, NID, address, client type (`INDIVIDUAL / COMPANY / ORGANIZATION`), linked cases, invoices, and an optional portal account. Deletion is blocked when cases exist.

**Two problems:**

1. **No internal/client-visible note separation.** `CaseUpdate` has a single visibility and the compose dialog states notes are visible to the team *and the client portal*. There is nowhere to record privileged strategy. This is a professional-practice gap, not just a feature gap.
2. **Deleting a client deletes their `User`.** Hard cascade, no soft delete.

NID is stored in plain text with no format validation and no field-level encryption.

**Score: 6 / 10**

---

## 9. LAWYER MANAGEMENT ASSESSMENT

Profile, Bar Council ID, specialisation, chamber name, years of experience, status, case load (total + active), optional portal account. Deletion blocked when cases are assigned.

**Correctly honest:** the Bar Council ID is stored as an unvalidated string. There is **no claim of official verification** anywhere in the codebase or UI. This is the right posture — see §14.

Missing: availability/calendar, workload capacity signal beyond a count, and per-hearing appearance tracking.

**Score: 7 / 10**

---

## 10. DOCUMENT MANAGEMENT ASSESSMENT

| Control | State |
|---|---|
| Upload | ✅ Multipart, per-case directory |
| **Size validation** | ✅ Pre-parse `Content-Length` + post-parse authoritative check |
| **MIME validation** | ✅ Server-side prefix allowlist |
| **Active content** | ✅ SVG/HTML/XHTML explicitly rejected with a helpful message |
| File naming | ✅ Sanitised to `[a-z0-9-]` + timestamp prefix |
| **Path traversal** | ✅ Single containment choke point (`resolveUploadPath`) |
| Download | ✅ Full access control + `CSP: default-src 'none'; sandbox` + `nosniff` + forced attachment for active types |
| **Client access** | ✅ `sharedWithClient` gate — default private |
| **URL guessing** | ✅ Fully blocked — every read runs case-access checks first |
| Preview | ⚠️ Inline disposition for safe types only |
| Delete | ⚠️ Hard delete of the row; **orphaned file left on disk** |
| Versioning | ❌ Each upload is an independent row |
| Metadata | ✅ Type, category, size, MIME, uploader, timestamp |
| **Storage durability** | ❌ **Local disk. No object store, no backup.** |

Security here is genuinely well done. The storage substrate is the problem, not the access model.

**Score: 6 / 10** — would be 9 on durable storage.

---

## 11. FINANCIAL / PAYMENT ASSESSMENT

**Server-authoritative:** verified. `POST /api/payments` re-reads the invoice inside a `$transaction`, sums existing payments, computes `remaining`, and rejects overpayment — the comment names TOCTOU as the reason for the transaction. Invoice status is derived from database values (`PAID / PARTIAL / OVERDUE / UNPAID`), never accepted from the client. `PATCH /api/invoices/[id]` allows only `CANCELLED` to be set manually; everything else recomputes.

| Item | State |
|---|---|
| Case fee / invoice | ✅ `billingType`, description, amount, due date |
| Consultation fee | ⚠️ Only as a `billingType` label |
| Partial payment | ✅ Multiple payments per invoice |
| Paid / due | ✅ Server-computed |
| Overpayment | ✅ Rejected with the remaining balance in the message |
| Cancelled invoice | ✅ Payments refused |
| Payment deletion | ✅ ADMIN-only, recomputes status, audited |
| **Expenses / disbursements** | ❌ Not modelled |
| **Refunds** | ❌ Not modelled |
| **Discount / tax** | ❌ Not modelled |
| **Time-based billing** | ❌ No time capture |
| **Trust / retainer** | ❌ Client money not separated from fee income |
| **Invoice PDF** | ❌ |
| **Payment gateway** | ❌ **None** |

**On payment honesty:** bKash / Nagad / Rocket are string labels on manually entered records. Nothing is verified or reconciled, and clients cannot pay from the portal. Critically, **the codebase makes no false claim** — there is no fake gateway, no sandbox pretending to be production. This is correct and should stay that way until a real integration exists.

**Score: 6 / 10** — the arithmetic and concurrency are right; the surrounding feature set is thin.

---

## 12. NOTIFICATION ASSESSMENT

Per-user rows with type (`INFO/HEARING/CASE/BILLING/SYSTEM`), optional case link, read/unread, and a `dedupeKey`. Ownership enforced on mutation (403 on another user's row). `read-all` and `unread-count` are session-scoped. Generated on hearing reminders, case assignment, document sharing, and payment receipt.

Delivery: in-app always; SMS/email via the outbound bridge when enabled, per-event toggles, `SIMULATED` when no provider is configured.

**Gaps:** in-app badge is polled every 60s (no realtime); no user-level preferences (only chamber-wide event toggles); no digest; portal is read-only so clients cannot reply.

**Score: 8 / 10**

---

## 13. AUDIT LOG ASSESSMENT

Append-only `AuditLog`: `actorId`, `actorName`, `actorRole`, `action`, `entityType`, `entityId`, `entityLabel`, `summary`, and a JSON `meta` field-level diff. Indexed four ways.

Covered: login, password change, case create/update/delete, client and lawyer changes, lawyer assignment, document upload/delete, hearing changes, invoice and payment changes, settings changes.

**Immutability:** no update or delete endpoint exists. Only ADMIN can read it. Password material is explicitly never recorded.

**Gaps:** no IP address or user agent on auth events; no retention policy; no export; no tamper-evidence (hash chaining) — an actor with direct database access could alter history.

**Score: 8 / 10** — among the strongest areas.

---

## 14. BANGLADESH SUITABILITY ASSESSMENT

The strongest dimension, and the actual competitive moat.

**Well handled:**
- Case-type taxonomy is genuinely Bangladeshi — writ petition, bail matter, land/property, labour, company/commercial, cyber crime — not a generic "matter type" field
- Court list and district list are local
- Vakalatnama treated as a first-class document category
- ৳ BDT with `en-IN` grouping (correct for the subcontinent, not `en-US`)
- bKash / Nagad / Rocket as native payment methods
- `Asia/Dhaka` throughout, as day-keys
- Bangla as a real UI language (~2,500 dictionary lines), with a Bengali webfont and a serif stack degrading per-glyph rather than to tofu
- Hearing statuses match cause-list vocabulary (adjourned ≠ postponed ≠ cancelled)

**Missing for Bangladeshi practice:**
- **Division** (the 8 administrative divisions) and **jurisdiction** are not modelled — only district
- **Legal notice** workflow (a distinct pre-litigation step) absent
- **Order / judgment** not a first-class record
- **Limitation periods** not tracked — the highest-consequence date in Bangladeshi litigation
- Phone numbers unvalidated against `+8801XXXXXXXXX` / `01XXXXXXXXX`
- NID stored unvalidated and unencrypted
- Cause-list ingestion from court sources (a genuine future wedge)

**Integration honesty — correct.** The system makes **no claim** of connection to any Bangladeshi court, the Bar Council, or NID verification. Bar Council IDs are stored, never validated. Any such capability must be labelled **Future Integration**.

**Score: 8 / 10**

---

## 15. SECURITY ASSESSMENT

| Threat | Status | Evidence |
|---|---|---|
| SQL injection | ✅ Protected | Prisma parameterised throughout; no raw SQL |
| XSS (reflected/stored) | ✅ Protected | React escaping; no `dangerouslySetInnerHTML`; uploads reject active content; downloads sandboxed |
| CSRF | ⚠️ Thin | `SameSite=Lax` + correct verbs, no token; bypassed in Bearer mode |
| **IDOR / BOLA** | ✅ Protected | Swept all 35 handlers — see §4 |
| Broken access control | ✅ Protected | Three-layer enforcement; API-level, not UI-level |
| Privilege escalation | ✅ Protected | No signup; role set only by ADMIN via allowlist |
| Mass assignment | ✅ Protected | Explicit per-field `data` construction everywhere |
| Insecure file upload | ✅ Protected | Size + MIME + active-content + sanitisation, all server-side |
| Path traversal | ✅ Protected | Single containment function |
| Exposed secrets | ⚠️ Partial | No secrets in source, but **seeded demo passwords are committed** |
| Weak password handling | ⚠️ Partial | scrypt sound; 6-char minimum is low; params not stored |
| JWT / session | ✅ Good | httpOnly, revocable, hard-fails without `AUTH_SECRET` in production |
| Information leakage | ✅ Good | Generic 500s; health endpoint returns booleans and Prisma codes only |
| API abuse / rate limiting | ⚠️ Partial | Login only |
| CORS | ✅ N/A | Same-origin; no CORS headers added |
| Security headers | ✅ Good | CSP, HSTS+preload, nosniff, Referrer-Policy, Permissions-Policy, frame-ancestors |
| Env exposure | ✅ Good | Only `NEXT_PUBLIC_ENABLE_*` flags are client-visible |
| **Static upload exposure** | ⚠️ **UNVERIFIED** | Middleware matcher excludes `uploads`. Must confirm no reverse proxy serves that directory directly |
| Encryption at rest | ⚠️ Deferred | Host-dependent; no app-level encryption of documents or NID |

**Escalation matrix — all tested by trace, all blocked:**
CLIENT → ADMIN ✅ · CLIENT → LAWYER data ✅ · LAWYER → other lawyer's cases ✅ · STAFF → financials ✅ · Any → another user's notifications ✅ · Any → unshared documents ✅
FIRM A → FIRM B: **N/A — single-tenant** (see §19).

**Score: 7 / 10** — sound design; unverified by testing, with gaps in recovery, throttling and one deployment-config unknown.

---

## 16. DATABASE ASSESSMENT

15 tables, 11 Postgres enums.

| Aspect | State |
|---|---|
| Relationships | ✅ FKs on every relation |
| Enums | ✅ Real Postgres enums — schema documents that text columns silently accepted typos |
| Unique constraints | ✅ `caseNumber`, `invoiceNumber`, `email`, `dedupeKey`, `userId` on profiles |
| Indexes | ✅ On FKs and on actually-queried columns: `hearingDate`, `(userId, isRead)`, `(status, createdAt)`, `(entityType, entityId)`, `(dedupeKey)` |
| Money precision | ✅ `Decimal(12,2)` + result extension |
| Timestamps | ✅ `createdAt` / `updatedAt` throughout |
| **Cascade behaviour** | ⚠️ No `onDelete` declared — relies on application-level guards |
| **Soft delete** | ❌ **Absent everywhere** |
| Data integrity | ✅ No duplicate/denormalised data except one deliberate snapshot (`OutboundMessage.caseNumber`, documented) |
| **Tenant column** | ❌ None — single-organisation |

**Score: 8 / 10** — would be 9 with soft deletes and explicit cascade rules.

---

## 17. API ASSESSMENT & PERMISSION MATRIX

35 handlers. Consistent envelope, consistent error shape, single error wrapper, machine-readable codes.

| Endpoint | ADMIN | LAWYER | STAFF | CLIENT | Record scoping |
|---|---|---|---|---|---|
| `POST /api/auth/login` | public | public | public | public | rate-limited |
| `GET /api/auth/me` | ✅ | ✅ | ✅ | ✅ | self |
| `POST /api/auth/change-password` | ✅ | ✅ | ✅ | ✅ | self; bumps `sessionVersion` |
| `GET /api/cases` | all | assigned | all | own | `caseScopeWhere` |
| `POST /api/cases` | ✅ | ❌ | ✅ | ❌ | — |
| `GET /api/cases/[id]` | ✅ | assigned | ✅ | own | `assertCaseReadAccess` |
| `PATCH /api/cases/[id]` | ✅ | assigned | ✅ | ❌ | `assertCaseWriteAccess`; lawyer cannot reassign |
| `DELETE /api/cases/[id]` | ✅ | ❌ | ❌ | ❌ | hard delete |
| `POST /api/cases/[id]/documents` | ✅ | assigned | ✅ | ❌ | write access + upload validation |
| `POST /api/cases/[id]/hearings` | ✅ | assigned | ✅ | ❌ | write access |
| `POST /api/cases/[id]/updates` | ✅ | assigned | ✅ | ❌ | write access |
| `GET /api/files/[documentId]` | ✅ | assigned | ✅ | **shared only** | full chain + sandbox headers |
| `DELETE /api/documents/[id]` | ✅ | assigned | ✅ | ❌ | file left on disk |
| `GET/PATCH /api/hearings/[id]` | ✅ | assigned | ✅ | read | via case |
| `GET /api/clients` | ✅ | assigned | ✅ | ❌ | scoped |
| `DELETE /api/clients/[id]` | ✅ | ❌ | ❌ | ❌ | blocked if cases exist; **deletes User** |
| `GET /api/lawyers` | ✅ | ✅ | ✅ | ❌ | |
| `DELETE /api/lawyers/[id]` | ✅ | ❌ | ❌ | ❌ | blocked if cases exist; **deletes User** |
| `GET /api/invoices` | ✅ | own cases | **403** | own | scoped |
| `PATCH /api/invoices/[id]` | ✅ | own cases | **403** | ❌ | only `CANCELLED` settable |
| `POST /api/payments` | ✅ | own cases | **403** | ❌ | transaction + balance check |
| `DELETE /api/payments/[id]` | ✅ | ❌ | ❌ | ❌ | recompute + audit |
| `GET /api/notifications` | ✅ | ✅ | ✅ | ✅ | self only |
| `PATCH /api/notifications/[id]` | ✅ | ✅ | ✅ | ✅ | 403 on another's |
| `GET /api/dashboard` | ✅ | ✅ | ✅ | ✅ | role-branched |
| `GET /api/reports` | ✅ | ❌ | ❌ | ❌ | loads all tables |
| `GET /api/audit` | ✅ | ❌ | ❌ | ❌ | read-only |
| `GET/POST /api/users*` | ✅ | ❌ | ❌ | ❌ | role via allowlist |
| `/api/outbound*` | ✅ | ❌ | ❌ | ❌ | |
| `/api/settings/outbound` | ✅ | ❌ | ❌ | ❌ | |
| `GET /api/health` | public | | | | leak-free |

Behaviour on edge cases is consistent: unauthenticated → 401; wrong role → 403; missing resource → 404; invalid field → 422; conflict → 409; oversized upload → 413.

**Score: 8 / 10**

---

## 18. UX ASSESSMENT

**Strong:** coherent token-driven design system; shared chrome factored into single components so eleven views read as one product; every table has a card layout below its breakpoint; real URLs for every screen, tab and detail panel; state encoded in form as well as colour (priority edge stripes, hatched overdue segments for deuteranopia); bilingual-aware typography; deliberate loading, empty, error and success states; destructive actions behind confirmation dialogs; visible focus rings and reduced-motion guards.

**Weak:** no calendar view (the most likely first complaint from a practising advocate); no global search; no bulk actions; dark mode defined but unreachable; no WCAG audit performed; accessibility is careful but unverified.

**Score: 8 / 10**

---

## 19. BUSINESS MODEL ASSESSMENT

**Architecture actually followed: (A) single law firm / single organisation per deployment.** There is no tenant or firm column on any table, and no query filters by organisation. This appears intentional and is a legitimate choice — but it is undocumented anywhere in the repository.

**Do not introduce multi-tenancy now.** It is not needed for the product as scoped, and retrofitting a tenant boundary across 15 tables under commercial pressure is precisely how cross-tenant leaks happen. Decide it deliberately, as its own project, after pilots.

| Question | Answer |
|---|---|
| Target customer | Small–mid Bangladeshi law chambers (roughly 3–50 people) |
| Value proposition | The only practice-management system built for Bangladeshi courts, in Bangla, billing in taka |
| Primary users | Advocates and clerical staff daily; principal weekly; clients occasionally |
| Main workflow | Intake → case → assignment → hearings → documents → billing → collection |
| Problem solved | Matter state scattered across registers, spreadsheets, WhatsApp and memory; missed hearing dates; untracked dues |
| Essential | Cases, hearings, documents, clients, billing, reminders, audit |
| Optional | Reports, client portal, SMS bridge |
| Unnecessary complexity | Multi-tenancy, trust accounting, workflow automation — none needed at current scope |

**Supported models today:** per-chamber self-hosted licence (ready), managed single-tenant hosting (near — needs the P0 fixes). **Not supported:** multi-tenant SaaS.

**Not assessed:** market size, competitor pricing, willingness to pay. I have no primary data and will not estimate it. These require chamber interviews before pricing is set.

**Score: 6 / 10** — coherent for a single chamber; commercially constrained and undocumented.

---

## 20. MISSING FEATURES

See `CURRENT-SYSTEM-AUDIT.md` §D for the full list of 21. Top ten by chamber impact:

1. Limitation / statutory deadline tracking
2. Court diary / calendar with iCal export
3. Invoice PDF generation and delivery
4. Payment gateway (bKash / Nagad / SSLCommerz) — **Future Integration**
5. Order / judgment as a first-class record
6. Global full-text search
7. Internal vs client-visible note separation
8. Time and expense capture
9. Conflict-of-interest check at intake
10. Task management with owner and due date

---

## 21. INCORRECT FEATURES

| # | Defect | Severity |
|---|---|---|
| C2 | In-process `setInterval` scheduler — N sweeps on N replicas, **zero on serverless** | P0 |
| C3 | Local-disk document storage — incompatible with both deployment targets | P0 |
| C8 | Zero automated tests | P0 |
| C5 | `uploads` excluded from middleware matcher — **UNVERIFIED** against the reverse proxy | P0 (verify) |
| C4 | Hard deletes; client/lawyer deletion destroys the linked `User` | P1 |
| B2 | Reports load entire tables, aggregate in JS, no date range | P1 |
| C6 | No password reset | P1 |
| C7 | Seeded credentials committed to source | P1 |
| C9 | No CSRF token; `SameSite` alone | P2 |
| B7 | scrypt cost parameters not stored; no rehash-on-login | P2 |
| B3 | Rate limiting on login only | P2 |
| C1 | `reactStrictMode: false` | P3 |

---

## 22. RECOMMENDED IMPROVEMENTS

**Do not rewrite.** Everything in `CURRENT-SYSTEM-AUDIT.md` §E must be preserved as-is. The work is:

- **Replace the storage substrate**, not the document feature — S3-compatible storage behind the existing `uploads.ts` seam, which is already the single choke point.
- **Move the scheduler trigger**, not the sweep — `POST /api/outbound/sweep` already exists and is idempotent. Delete the interval; call the endpoint from external cron.
- **Add tests around existing behaviour**, changing none of it. The permission matrix first.
- **Add `deletedAt`** and filter reads; keep the existing delete guards.
- **Push report aggregation into SQL** with a date range — fixes performance and the commercial gap together.
- **Add a reset flow** reusing the existing `sessionVersion` mechanism.
- **Store hashing parameters in the hash string** now, while the user table is small.
- **Separate internal notes** from client-visible ones with a `visibility` column on `CaseUpdate`.

---

## 23. PRIORITIES

### P0 — Critical (before any real chamber data)
1. **Verify** no reverse proxy serves `uploads/` directly — a one-hour check that could be a total document breach
2. Object storage for documents
3. External cron for the reminder sweep; remove the in-process interval
4. Test suite: permission matrix, invoice status derivation, payment arithmetic, reminder dedupe
5. CI running typecheck + lint + tests
6. Backup **and rehearsed restore** for database and files
7. Replace committed seed passwords with generated ones

### P1 — Important
8. Soft deletes with retention rules
9. Password reset flow
10. Error tracking with alerting
11. Report aggregation in SQL with date ranges
12. Limitation / deadline tracking
13. Invoice PDF generation
14. Internal vs client-visible note separation
15. Court diary / calendar view
16. README, setup and deployment documentation

### P2 — Improvement
17. Server-side paging in list views (`meta.hasMore` already returned)
18. API rate limiting beyond login
19. 2FA for ADMIN
20. Store scrypt parameters; rehash on login
21. Global full-text search
22. Order/judgment as a first-class record
23. Task management
24. Division and jurisdiction fields
25. Phone and NID validation
26. Conflict-of-interest checking
27. Enable the dark theme already defined
28. Orphaned-file cleanup on document delete
29. CSRF token or `SameSite=Strict`

### P3 — Nice to have
30. Payment gateway — **Future Integration**
31. Time and expense capture
32. Document templates and versioning
33. Two-way portal messaging
34. Trust / retainer accounting
35. Bulk operations
36. Mobile app / PWA
37. Cause-list ingestion — **Future Integration**
38. Multi-tenancy — only if pilots prove self-serve demand
39. `reactStrictMode: true`

---

## 24. TESTING CHECKLIST

### Authentication
- [ ] Login with valid credentials issues an httpOnly cookie
- [ ] Invalid password → 401, no user-existence disclosure
- [ ] Unknown email → 401 in comparable time to a wrong password
- [ ] 9th failed attempt within 10 min → locked out
- [ ] Lockout holds across a simulated second instance (shared DB bucket)
- [ ] `INACTIVE` account cannot sign in
- [ ] Logout clears the cookie; the old token no longer authenticates
- [ ] Password change bumps `sessionVersion`; a token from another device stops working
- [ ] Password change keeps the *calling* session signed in
- [ ] Expired JWT → 401
- [ ] Tampered JWT signature → 401
- [ ] Production boot without `AUTH_SECRET` → refuses to start
- [ ] Password < 6 or > 128 chars rejected
- [ ] New password identical to current → rejected

### RBAC — every role × every protected resource
- [ ] CLIENT → `/api/reports`, `/api/audit`, `/api/users`, `/api/outbound` → 403 each
- [ ] STAFF → `/api/invoices`, `/api/payments` (GET and POST) → 403
- [ ] LAWYER → unassigned case GET/PATCH/DELETE → 403
- [ ] LAWYER → another lawyer's invoice PATCH → 403
- [ ] LAWYER → another lawyer's invoice payment POST → 403
- [ ] LAWYER attempts to change `clientId`/`lawyerId` on their own case → 403
- [ ] CLIENT → another client's case → 403
- [ ] CLIENT → own case → 200
- [ ] CLIENT passes `?clientId=<other>` to `/api/payments` → own data only
- [ ] Any user → another user's notification PATCH → 403
- [ ] Unauthenticated → every protected endpoint → 401
- [ ] Non-existent id with valid role → 404 (not 403 — no existence oracle)

### Case
- [ ] Create with all required fields; duplicate `caseNumber` → 409
- [ ] Invalid `type` / `status` / `priority` enum → 422
- [ ] PATCH with unknown field → ignored, not persisted
- [ ] Set `RESOLVED` without a resolution summary → rejected
- [ ] Set `CLOSED` with summary → `closedAt` populated
- [ ] Lawyer reassignment notifies the new lawyer
- [ ] Delete cascades cleanly and is audited
- [ ] Status change appears in the audit diff

### Hearing
- [ ] Create with date only (no time) renders correctly
- [ ] Hearing scheduled for **today** appears in the today sweep (Dhaka day-key regression)
- [ ] Outcome capture propagates `nextHearingDate` to the case
- [ ] Status transitions across all five values
- [ ] Access control via the parent case
- [ ] Hearing in the past — confirm intended behaviour (currently allowed)

### Document
- [ ] Upload > 10 MB → 413 before body buffering
- [ ] Upload disallowed MIME → 422
- [ ] Upload `.svg` → 422 with the export-to-PDF message
- [ ] Filename `../../etc/passwd` → sanitised, written inside the case directory
- [ ] Download as CLIENT when `sharedWithClient = false` → 403
- [ ] Download as CLIENT when shared → 200
- [ ] Download by an unrelated authenticated user → 403
- [ ] Response carries `CSP: default-src 'none'; sandbox` and `nosniff`
- [ ] `filePath` manipulated in DB to an outside path → resolver returns null → 404
- [ ] **Direct HTTP request to `/uploads/<caseId>/<file>` → must 404** (C5 verification)

### Financial
- [ ] Invoice number is monotonic; delete the newest, create another — number does not repeat
- [ ] Payment exceeding remaining balance → 422 naming the balance
- [ ] Two concurrent payments for the full balance → exactly one succeeds
- [ ] Part-payment → status `PARTIAL`; completing → `PAID`
- [ ] Payment against a `CANCELLED` invoice → 409
- [ ] Payment deletion recomputes status correctly
- [ ] Client-supplied `status` in an invoice PATCH other than `CANCELLED` → 422
- [ ] Sum of many part-payments equals the invoice exactly (no float drift)
- [ ] Invoice past due with no payment → `OVERDUE` after the sweep

### Security
- [ ] Sequential/guessed ids across all `[id]` endpoints for each role
- [ ] `role` field injected into `PATCH /api/users/[id]` by a non-admin → 403
- [ ] Extra fields in any PATCH body → silently ignored
- [ ] `X-Forwarded-For` rotation does not reset the email-bucket lockout
- [ ] Security headers present on an app route response
- [ ] Health endpoint returns no secret values
- [ ] 500 responses carry no stack trace or Prisma message

### Notification
- [ ] Reminder sweep run twice produces no duplicate messages (dedupe key)
- [ ] `read-all` affects only the calling user
- [ ] Unread count is per-user

---

## 25. PRODUCTION READINESS SCORE

| Dimension | Score | Basis |
|---|---:|---|
| Architecture | **7 / 10** | Clean layering; two single-instance dependencies |
| Authentication | **7 / 10** | Strong primitives; no reset, no 2FA |
| Authorization | **8 / 10** | Three-layer, no IDOR found; entirely untested |
| Security | **7 / 10** | Sound design; one unverified deployment risk, partial throttling |
| Case management | **7 / 10** | Solid lifecycle; no deadlines, orders or unified timeline |
| Business logic | **8 / 10** | Server-authoritative money, TOCTOU-safe, monotonic numbering |
| Database | **8 / 10** | Enums, FKs, indexes, exact money; no soft delete |
| API | **8 / 10** | Consistent, validated, correctly scoped |
| UI / UX | **8 / 10** | Coherent system, responsive, bilingual; no calendar or search |
| Bangladesh suitability | **8 / 10** | Genuine localisation depth; missing division/limitation/notice |
| **Testing & QA** | **1 / 10** | None exists |
| **Operations** | **2 / 10** | No backups, monitoring, CI or docs |
| | | |
| **OVERALL READINESS** | **6.5 / 10** | **Pilot-ready after P0. Not yet production-ready.** |

**Interpretation.** The product scores like a mature system and the process scores like a prototype. That is an unusually favourable position: the hard part — correct domain logic and a sound security model — is done, and the remaining work is well-understood engineering with known solutions. The two lowest scores are also the two cheapest to raise.

---

## 26. IMPLEMENTATION PLAN

Ten phases, dependency-ordered. Nothing in a later phase is safe to start before the earlier one lands.

### PHASE 1 — Critical security verification · Risk: LOW · ~1 day
| | |
|---|---|
| Files | `Caddyfile`, deployment config, `src/middleware.ts` |
| DB | None |
| API | None |
| Frontend | None |
| Tests | Direct HTTP request to `/uploads/<caseId>/<file>` must 404 |
| **Do first** | If the proxy serves that directory, every document is public — this is a one-hour check that could be a total breach |

### PHASE 2 — Storage & scheduler · Risk: MEDIUM · ~1 week
| | |
|---|---|
| Files | `src/lib/uploads.ts`, `src/app/api/cases/[id]/documents/route.ts`, `src/app/api/files/[documentId]/route.ts`, `src/lib/scheduler.ts`, `src/instrumentation.ts` |
| DB | None — `filePath` already stores a relative key |
| API | `/api/outbound/sweep` gains a shared-secret header for cron |
| Frontend | None |
| Tests | Upload → download round-trip; containment still enforced; sweep idempotent when called twice |
| Risk note | `uploads.ts` is already the single choke point, which is why this is contained. Migrate existing files with a one-off script; keep disk fallback behind a flag for one release |

### PHASE 3 — Test foundation & CI · Risk: LOW · ~2 weeks
| | |
|---|---|
| Files | New `tests/`; `package.json` test script; CI workflow |
| DB | Test database + seeding fixtures |
| API | None — tests characterise existing behaviour, change none of it |
| Frontend | None |
| Tests | The whole §24 RBAC and Financial blocks |
| Risk note | Highest-value phase. Write tests that *lock in* current behaviour before any later phase modifies it |

### PHASE 4 — Operational safety · Risk: LOW · ~3 days
| | |
|---|---|
| Files | Deployment scripts, new `README.md`, `docs/RUNBOOK.md` |
| DB | Automated dump schedule |
| API | None |
| Frontend | None |
| Tests | **Rehearse a full restore into a clean environment** — an untested backup is not a backup |
| Also | Error tracking with alerting; uptime monitoring on `/api/health`; generated seed passwords |

### PHASE 5 — Data lifecycle · Risk: MEDIUM · ~1 week
| | |
|---|---|
| Files | `prisma/schema.prisma`, all `[id]` DELETE handlers, all list queries |
| DB | **Migration** — add `deletedAt` to Case, Client, Lawyer, Invoice, Payment, CaseDocument, CaseUpdate, Hearing |
| API | DELETE becomes soft; reads filter `deletedAt: null`; new ADMIN restore endpoint |
| Frontend | Optional "recently deleted" view for ADMIN |
| Tests | Soft-deleted records absent from lists but restorable; existing delete guards still hold |
| Risk note | Touches every read query. Do it after Phase 3 so the tests catch a missed filter |

### PHASE 6 — Authentication completion · Risk: MEDIUM · ~1 week
| | |
|---|---|
| Files | New `src/app/api/auth/forgot-password/`, `reset-password/`; `src/lib/password.ts` |
| DB | **Migration** — `PasswordResetToken` (hashed token, expiry, single-use flag) |
| API | Two new public endpoints, both rate-limited |
| Frontend | Forgot-password and reset screens |
| Tests | Token expiry, single use, session revocation on reset, rate limiting |
| Also | Store scrypt parameters in the hash; rehash on next successful login |

### PHASE 7 — Case workflow depth · Risk: LOW · ~2 weeks
| | |
|---|---|
| Files | `prisma/schema.prisma`, cases API, case-detail view |
| DB | **Migration** — `Deadline` table; `visibility` on `CaseUpdate`; `division`/`jurisdiction` on `Case`; `Order` entity |
| API | Deadline CRUD; sweep extended to deadline reminders |
| Frontend | Unified case timeline; internal-vs-client note toggle; deadline panel |
| Tests | Deadline reminders fire; internal notes never appear in the client portal |
| Risk note | The internal-note change is a **privacy-critical** default — new notes must default to internal, and existing rows must migrate to client-visible to preserve current behaviour |

### PHASE 8 — Hearings & documents · Risk: LOW · ~1 week
| | |
|---|---|
| Files | Hearings view, documents API |
| DB | Optional `lawyerId` on `Hearing` for appearance tracking |
| API | Orphaned-file cleanup on document delete |
| Frontend | Calendar / court diary with month and week grids; iCal feed |
| Tests | Calendar renders across month boundaries in Dhaka time |

### PHASE 9 — Financial completion · Risk: MEDIUM · ~2 weeks
| | |
|---|---|
| Files | Invoices API, billing view, new PDF module |
| DB | **Migration** — `Expense` table; discount/tax fields if required |
| API | Report aggregation moved into SQL with date ranges; CSV export; invoice PDF |
| Frontend | Date-range controls on reports; PDF download |
| Tests | Aggregates match a known dataset; PDF totals match the invoice exactly |
| Explicitly out of scope | Payment gateway — mark **Future Integration** until a real merchant account exists |

### PHASE 10 — Production hardening · Risk: LOW · ~1 week
| | |
|---|---|
| Files | `next.config.ts`, middleware, list views |
| DB | None |
| API | Rate limiting beyond login; server-side paging consumed by the UI |
| Frontend | Global search; theme provider for the existing dark tokens; `reactStrictMode: true` |
| Tests | Full §24 checklist green |
| Then | **Independent penetration test scoped to the authorization layer** — the highest-value target and the layer no test previously covered |

---

## APPENDIX — GROUND RULES OBSERVED

- No code was changed during this audit.
- No feature was recommended for rewrite where it is already correct — see `CURRENT-SYSTEM-AUDIT.md` §E.
- No integration is claimed that does not exist. Payment gateways, court connections, Bar Council verification and NID validation are all marked **Future Integration**.
- No market sizing, competitor analysis or financial projection is offered — no primary data was available.
- One item (`uploads` static exposure) is marked **UNVERIFIED** and made Phase 1 rather than being asserted either way.
