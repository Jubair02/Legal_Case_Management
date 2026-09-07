import { unlinkSync } from "fs"
import { db } from "@/lib/db"
import { ApiError, handle, readJson, requireAuth } from "@/lib/api-helpers"
import { assertCaseWriteAccess, isStaffOrAdmin } from "@/lib/permissions"

function documentDTO(d: {
  id: string
  caseId: string
  documentName: string
  documentType: string | null
  category: string | null
  fileName: string | null
  fileSize: number | null
  mimeType: string | null
  sharedWithClient: boolean
  uploadedByName: string | null
  createdAt: Date
}) {
  return {
    id: d.id,
    caseId: d.caseId,
    documentName: d.documentName,
    documentType: d.documentType,
    category: d.category,
    fileName: d.fileName,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    sharedWithClient: d.sharedWithClient,
    uploadedByName: d.uploadedByName,
    createdAt: d.createdAt,
  }
}

async function loadDocument(id: string) {
  const doc = await db.caseDocument.findUnique({ where: { id } })
  if (!doc) throw new ApiError("Document not found.", 404)
  return doc
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "STAFF", "LAWYER"])
    const { id } = await params
    const doc = await loadDocument(id)

    // ADMIN/STAFF always allowed; LAWYER only on assigned cases (write access check)
    if (!isStaffOrAdmin(user)) {
      await assertCaseWriteAccess(user, doc.caseId)
    }

    const body = await readJson<Record<string, unknown>>(request)
    const data: Record<string, unknown> = {}
    if (body.sharedWithClient !== undefined) {
      data.sharedWithClient =
        typeof body.sharedWithClient === "boolean"
          ? body.sharedWithClient
          : body.sharedWithClient === "true"
    }
    if (body.documentName !== undefined) {
      const name = typeof body.documentName === "string" ? body.documentName.trim() : ""
      if (!name) throw new ApiError('"documentName" cannot be empty.', 422)
      data.documentName = name
    }
    if (body.category !== undefined) {
      data.category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : null
    }

    const updated = await db.caseDocument.update({ where: { id }, data: data as never })
    return Response.json({ data: documentDTO(updated) })
  })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "STAFF", "LAWYER"])
    const { id } = await params
    const doc = await loadDocument(id)

    // ADMIN/STAFF always allowed; LAWYER only on assigned cases; CLIENT never (403 from requireAuth)
    if (!isStaffOrAdmin(user)) {
      await assertCaseWriteAccess(user, doc.caseId)
    }

    // Delete the DB row first so a failed delete never leaves a dangling row
    // pointing at an already-removed file; unlink is best-effort afterwards.
    await db.caseDocument.delete({ where: { id } })
    if (doc.filePath) {
      try {
        unlinkSync(doc.filePath)
      } catch {
        // best-effort file removal
      }
    }
    return Response.json({ data: { ok: true } })
  })
}
