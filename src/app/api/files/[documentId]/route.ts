import { readFile } from "fs/promises"
import { db } from "@/lib/db"
import { ApiError, handle, requireAuth } from "@/lib/api-helpers"
import { assertCaseReadAccess, isStaffOrAdmin } from "@/lib/permissions"
import { resolveUploadPath } from "@/lib/uploads"

export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  return handle(async () => {
    const user = await requireAuth()
    const { documentId } = await params

    const doc = await db.caseDocument.findUnique({
      where: { id: documentId },
      include: { case: { select: { id: true, clientId: true, lawyerId: true } } },
    })
    if (!doc) throw new ApiError("Document not found.", 404)

    if (!isStaffOrAdmin(user)) {
      // enforces LAWYER assignment + CLIENT ownership (404/403)
      await assertCaseReadAccess(user, doc.caseId)
      if (user.role === "CLIENT" && !doc.sharedWithClient) {
        throw new ApiError("This document has not been shared with you.", 403)
      }
    }

    // resolveUploadPath enforces containment: never serve anything outside
    // the uploads directory.
    const absPath = resolveUploadPath(doc.filePath)
    if (!absPath) throw new ApiError("File not found on disk.", 404)

    let buf: Buffer
    try {
      buf = await readFile(absPath)
    } catch {
      throw new ApiError("File not found on disk.", 404)
    }

    const download = new URL(request.url).searchParams.get("download") === "1"
    const name = doc.fileName ?? doc.documentName

    // SVG (and any other active content) is never served inline — force download
    // with a sandboxed CSP so embedded scripts cannot run same-origin.
    const mime = doc.mimeType ?? "application/octet-stream"
    const isActiveContent =
      mime === "image/svg+xml" ||
      mime.startsWith("image/svg") ||
      mime.includes("javascript") ||
      mime === "text/html" ||
      mime === "application/xhtml+xml"
    const disposition = download || isActiveContent ? "attachment" : "inline"

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    })
  })
}
