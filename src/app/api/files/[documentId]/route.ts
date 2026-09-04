import { readFile } from "fs/promises"
import path from "path"
import { db } from "@/lib/db"
import { ApiError, handle, requireAuth } from "@/lib/api-helpers"
import { assertCaseReadAccess, isStaffOrAdmin } from "@/lib/permissions"

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

    let buf: Buffer
    try {
      buf = await readFile(absPath)
    } catch {
      throw new ApiError("File not found on disk.", 404)
    }

    const download = new URL(request.url).searchParams.get("download") === "1"
    const name = doc.fileName ?? doc.documentName
    const disposition = download ? "attachment" : "inline"

    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": doc.mimeType ?? "application/octet-stream",
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, max-age=0",
      },
    })
  })
}
