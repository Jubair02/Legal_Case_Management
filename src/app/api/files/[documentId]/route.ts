import { readFile } from "fs/promises"
import path from "path"
import { db } from "@/lib/db"
import { ApiError, handle, requireAuth } from "@/lib/api-helpers"
import { assertCaseReadAccess, isStaffOrAdmin } from "@/lib/permissions"

/** Uploads root — file reads must never escape this directory. */
const UPLOADS_ROOT = path.join(process.cwd(), "uploads")

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

    if (!doc.filePath) throw new ApiError("File not found on disk.", 404)
    const absPath = path.isAbsolute(doc.filePath) ? doc.filePath : path.join(process.cwd(), doc.filePath)

    // Defense-in-depth: never serve anything outside the uploads directory.
    if (!absPath.startsWith(UPLOADS_ROOT + path.sep)) {
      throw new ApiError("File not found on disk.", 404)
    }

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
