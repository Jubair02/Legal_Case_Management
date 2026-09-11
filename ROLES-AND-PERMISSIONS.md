# Roles & Permissions

Authoritative reference for what each role can do in AinSheba. Derived from the
route handlers themselves, not from a design document — if this file and the
code disagree, **the code is right and this file is a bug**.

Four roles exist (`Role` enum in [prisma/schema.prisma](prisma/schema.prisma)):
`ADMIN`, `STAFF`, `LAWYER`, `CLIENT`. There is no self-registration; accounts are
provisioned by an ADMIN (`POST /api/users`) or, for clients, by ADMIN/STAFF
alongside the client record (`POST /api/clients`).

## The two axes

The roles do not sit on a single scale:

- **ADMIN vs STAFF** is a difference of **authority**. Both see every case in the
  chamber. STAFF is cut off from money, people management and system tooling.
- **ADMIN/STAFF vs LAWYER** is a difference of **scope**. A lawyer sees only the
  cases assigned to them, enforced per-record and per-query rather than by role
  name alone.

CLIENT is scoped the same way as LAWYER, against `Case.clientId` instead of
`Case.lawyerId`, and additionally only sees documents marked `sharedWithClient`.

## Where enforcement lives

Three layers, in order:

1. **[src/middleware.ts](src/middleware.ts)** — route gate reading the role from
   the JWT. **UX only.** It never touches the database and must never be the
   only thing standing between a user and a record.
2. **`requireAuth([roles])`** in [src/lib/api-helpers.ts](src/lib/api-helpers.ts)
   — authenticates and gates each handler by role, throwing 401/403.
3. **[src/lib/permissions.ts](src/lib/permissions.ts)** — per-record assertions
   (`assertCaseReadAccess`, `assertCaseWriteAccess`) and the list scope filter
   (`caseScopeWhere`), which resolve the caller's lawyer/client profile before
   granting anything.

A handler that lists records needs layer 3's scope filter; a handler that
touches one record by id needs layer 3's assertion. Layer 2 alone is only
sufficient for endpoints where the whole role is allowed or denied outright
(reports, audit, users, outbound settings).

## Capability matrix

| Capability | ADMIN | STAFF | LAWYER | CLIENT |
|---|:--:|:--:|:--:|:--:|
| **Cases** |||||
| See cases | All | All | Assigned only | Own only |
| Create case | ✅ | ✅ | ❌ | ❌ |
| Edit case | ✅ | ✅ | Assigned only | ❌ |
| Reassign client/lawyer on a case | ✅ | ✅ | ❌ | ❌ |
| Delete case | ✅ | ❌ | ❌ | ❌ |
| **Hearings** |||||
| See hearings | All | All | Assigned cases | Own cases |
| Add / edit hearing | ✅ | ✅ | Assigned cases | ❌ |
| See internal hearing detail (judge, notes, orders, next action) | ✅ | ✅ | ✅ | ❌ |
| **Documents** |||||
| See documents | All | All | Assigned cases | Shared only |
| Upload | ✅ | ✅ | Assigned cases | ❌ |
| Rename / re-categorise | ✅ | ✅ | Assigned cases | ❌ |
| Share with client / stop sharing | ✅ | ✅ | Assigned cases | ❌ |
| Delete document | ✅ | ✅ | Assigned cases | ❌ |
| **Clients** |||||
| See clients | All | All | Clients of assigned cases | Self only |
| Create / edit client | ✅ | ✅ | ❌ | ❌ |
| Create client portal login | ✅ | ✅ | ❌ | ❌ |
| Delete client | ✅ | ❌ | ❌ | ❌ |
| **Lawyers** |||||
| View lawyer roster | ✅ | ✅ | ✅ | ❌ |
| Create / edit / delete lawyer | ✅ | ❌ | ❌ | ❌ |
| **Money** |||||
| See invoices & payments | All | ❌ **403** | Own cases | Own only |
| Create invoice | ✅ | ❌ | Own cases (case required) | ❌ |
| Edit / cancel invoice | ✅ | ❌ | Own cases | ❌ |
| Record payment | ✅ | ❌ | Own cases | ❌ |
| Delete invoice / payment | ✅ | ❌ | ❌ | ❌ |
| **People & system** |||||
| Manage users (any role) | ✅ | ❌ | ❌ | ❌ |
| Reports | ✅ | ❌ | ❌ | ❌ |
| Audit log | ✅ | ❌ | ❌ | ❌ |
| Outbound SMS/email settings & outbox | ✅ | ❌ | ❌ | ❌ |
| Change own password | ✅ | ✅ | ✅ | ✅ |

## One line each

- **ADMIN** — the chamber owner. Everything, and the only role that can delete
  anything or reach users, reports, audit and outbound settings.
- **STAFF** — the clerk. Chamber-wide case operations: register cases and
  clients, file documents, schedule hearings, provision client portal logins.
  Deliberately blind to all financial data.
- **LAWYER** — the advocate. Deep but narrow: full control of assigned cases
  *including billing them*, plus the clients on those cases. Cannot see other
  advocates' matters, open a case, register a client, or reassign work.
- **CLIENT** — the portal visitor. Read-only view of their own cases, the
  documents the chamber chose to share, their hearing dates, and their invoices.

## Rules that are easy to get wrong

**STAFF's financial block is a hard 403, not a hidden menu.** `GET /api/invoices`
and `GET /api/payments` reject STAFF outright, and `buildCaseDetail` returns
`invoices: []` for STAFF so the case detail response carries no financial data
either. Do not "fix" a STAFF 403 on a billing endpoint by widening the role
list — the omission is the feature.

**A LAWYER must attach a case to an invoice.** Case-less invoices are ADMIN-only,
because the case is what scopes the invoice to that lawyer. Without one there is
nothing to check ownership against, so `POST /api/invoices` returns 422 for a
lawyer who omits it.

**A LAWYER cannot change assignment.** `PATCH /api/cases/[id]` explicitly rejects
`clientId` or `lawyerId` in the body from a LAWYER with a 403 — otherwise a
lawyer could hand themselves someone else's case, or hand their own away.

**CLIENT-supplied scope parameters are never honoured.** `?clientId=` on the
invoice and payment lists is ignored for CLIENT; the filter is forced to their
own profile. Any new list endpoint must do the same.

**Client documents are filtered at the query, not in the view.**
`buildCaseDetail` applies `sharedWithClient: true` for CLIENT, and
`/api/files/[documentId]` re-checks the flag before reading the file off disk.
Both are needed: the first keeps unshared documents out of the response, the
second stops a guessed URL.

## Known asymmetries

These are consequences of the current design rather than bugs. Listed so they
are decided deliberately rather than discovered:

- **A lawyer can bill a client they cannot create.** Case and client creation is
  ADMIN/STAFF only, but invoicing is ADMIN/LAWYER. An advocate taking on new
  work must have a clerk register the client and case first, then can invoice
  independently.
- **STAFF can read the lawyer roster via the API but has no navigation link for
  it.** `GET /api/lawyers` permits STAFF; `NAV_GROUPS.STAFF` omits the item.
- **Deletion is centralised on ADMIN**, with documents the sole exception (STAFF
  and assigned lawyers may delete those). Good for the audit trail; it does mean
  a mistyped case needs the owner.

## When adding an endpoint

1. Pick the role list for `requireAuth` — the narrowest that works.
2. If it returns a list of cases, hearings, documents or invoices, run the query
   through `caseScopeWhere` (or an equivalent explicit filter).
3. If it touches one record by id, call `assertCaseReadAccess` or
   `assertCaseWriteAccess` before doing anything with it.
4. If it exposes financial data, exclude STAFF explicitly.
5. Update the matrix above in the same commit.
