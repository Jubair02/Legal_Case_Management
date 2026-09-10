import { readFile } from "fs/promises"
import { db } from "@/lib/db"
import { ApiError, handle, requireAuth } from "@/lib/api-helpers"
import { assertCaseReadAccess, isStaffOrAdmin } from "@/lib/permissions"
import { resolveUploadPath } from "@/lib/uploads"
import { CLOUDINARY_PROVIDER, signedDownloadUrl } from "@/lib/cloudinary"

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

    // Every access check above has passed by this point. Only now is the
    // storage backend touched — and the Cloudinary asset is `authenticated`,
    // so the signed URL below is used server-side and never reaches the
    // browser. Clients cannot bypass this route to reach the object.
    let buf: Buffer
    if (doc.storageProvider === CLOUDINARY_PROVIDER) {
      if (!doc.filePath) throw new ApiError("File not found.", 404)
      let upstream: Response
      try {
        upstream = await fetch(signedDownloadUrl(doc.filePath, doc.storageResourceType))
      } catch (e) {
        console.error("[files] cloudinary fetch failed", e)
        throw new ApiError("The document store is unreachable. Please try again.", 502)
      }
      if (!upstream.ok) {
        console.error("[files] cloudinary responded", upstream.status, doc.filePath)
        throw new ApiError("File not found.", 404)
      }
      buf = Buffer.from(await upstream.arrayBuffer())
    } else {
      // Legacy local rows: resolveUploadPath enforces containment, so nothing
      // outside the uploads directory is ever served.
      const absPath = resolveUploadPath(doc.filePath)
      if (!absPath) throw new ApiError("File not found on disk.", 404)
      try {
        buf = await readFile(absPath)
      } catch {
        throw new ApiError("File not found on disk.", 404)
      }
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
