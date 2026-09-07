import { mkdirSync, writeFileSync } from "fs"
import path from "path"
import { db } from "@/lib/db"
import { ApiError, handle, optionalString, requireAuth } from "@/lib/api-helpers"
import { assertCaseWriteAccess } from "@/lib/permissions"
import { ALLOWED_MIME_PREFIXES, MAX_FILE_SIZE } from "@/lib/constants"
import { clientUserId, notifyUsers } from "@/lib/notify"

function sanitizeFileName(name: string): string {
  const dot = name.lastIndexOf(".")
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ""
  const safeBase =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "file"
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, "")
  return `${safeBase}${safeExt}`
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireAuth(["ADMIN", "STAFF", "LAWYER"])
    const { id } = await params
    await assertCaseWriteAccess(user, id)

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      throw new ApiError("Expected a multipart/form-data upload with a \"file\" field.", 400)
    }
    const file = form.get("file")
    if (!(file instanceof File)) {
      throw new ApiError('"file" is required.', 422)
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new ApiError("File exceeds the 10 MB limit.", 422)
    }
    const mimeType = file.type || ""
    if (!ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
      throw new ApiError("Unsupported file type.", 422)
    }
    // Active content is never accepted — SVG/HTML can execute script when opened.
    if (
      mimeType === "image/svg+xml" ||
      mimeType.startsWith("image/svg") ||
      mimeType === "text/html" ||
      mimeType === "application/xhtml+xml"
    ) {
      throw new ApiError("SVG/HTML files are not allowed — export to PDF or PNG instead.", 422)
    }

    const originalName = file.name || "upload"
    const safeName = sanitizeFileName(originalName)
    const savedFileName = `${Date.now()}-${safeName}`

    const uploadsRoot = path.join(process.cwd(), "uploads")
    const caseDir = path.join(uploadsRoot, id)
    mkdirSync(caseDir, { recursive: true })
    const filePath = path.join(caseDir, savedFileName)
    const buffer = Buffer.from(await file.arrayBuffer())
    writeFileSync(filePath, buffer)

    const documentName = optionalString(form.get("documentName")) ?? originalName
    const documentType = optionalString(form.get("documentType"))
    const category = optionalString(form.get("category"))
    const sharedWithClient = form.get("sharedWithClient") === "true"

    const created = await db.caseDocument.create({
      data: {
        caseId: id,
        documentName,
        documentType,
        category,
        fileName: safeName,
        filePath,
        fileSize: file.size,
        mimeType: mimeType || null,
        sharedWithClient,
        uploadedById: user.id,
        uploadedByName: user.name,
      },
    })

    if (sharedWithClient) {
      const caseRow = await db.case.findUnique({
        where: { id },
        select: { clientId: true, caseNumber: true },
      })
      if (caseRow) {
        const clientPortalUserId = await clientUserId(caseRow.clientId)
        await notifyUsers([clientPortalUserId], {
          title: `New Document — ${documentName}`,
          message: `A document has been shared with you on case ${caseRow.caseNumber}.`,
          type: "CASE",
          caseId: id,
          link: `case-detail:${id}`,
        })
      }
    }

    return Response.json(
      {
        data: {
          id: created.id,
          caseId: created.caseId,
          documentName: created.documentName,
          documentType: created.documentType,
          category: created.category,
          fileName: created.fileName,
          fileSize: created.fileSize,
          mimeType: created.mimeType,
          sharedWithClient: created.sharedWithClient,
          uploadedByName: created.uploadedByName,
          createdAt: created.createdAt,
        },
      },
      { status: 201 }
    )
  })
}
