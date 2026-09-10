import { v2 as cloudinary, type UploadApiResponse } from "cloudinary"

/**
 * Cloudinary document storage.
 *
 * Case documents are privileged material, so nothing here is uploaded
 * publicly. Every asset is stored with `type: "authenticated"`, which means a
 * bare delivery URL returns 401 — the only way to read a document is through
 * `GET /api/files/[documentId]`, which runs the full access chain first
 * (case access → `sharedWithClient` gate → signed fetch → sandboxed response).
 *
 * The signed URL is generated per request, used server-side by `fetch`, and
 * discarded. It is never sent to the browser.
 *
 * When the three environment variables are absent the app falls back to the
 * original local-disk path, so a developer or a self-hosting chamber without a
 * Cloudinary account keeps working unchanged. See `lib/uploads.ts`.
 */

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME
const API_KEY = process.env.CLOUDINARY_API_KEY
const API_SECRET = process.env.CLOUDINARY_API_SECRET

/** True when all three credentials are present; drives the storage branch. */
export const CLOUDINARY_ENABLED = Boolean(CLOUD_NAME && API_KEY && API_SECRET)

/** Value written to `CaseDocument.storageProvider` for Cloudinary-backed rows. */
export const CLOUDINARY_PROVIDER = "CLOUDINARY"

/** Everything lives under one prefix so the account stays navigable. */
const ROOT_FOLDER = "ainsheba/cases"

let configured = false

function client() {
  if (!CLOUDINARY_ENABLED) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET."
    )
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: CLOUD_NAME,
      api_key: API_KEY,
      api_secret: API_SECRET,
      secure: true,
    })
    configured = true
  }
  return cloudinary
}

/** Signed download URLs are used immediately by a server-side fetch. */
const DOWNLOAD_TTL_SECONDS = 120

/**
 * Every document is stored as `raw`, whatever its MIME type.
 *
 * This app never uses a Cloudinary URL in the browser and never asks for a
 * transformation — `GET /api/files/[documentId]` proxies the bytes — so the
 * `image` resource class buys nothing and costs two things: it strips the
 * extension into a separate `format` field, and it drags PDFs into
 * Cloudinary's image pipeline. `raw` stores the bytes verbatim with the
 * extension intact, which keeps one code path for upload, download and
 * destroy.
 */
export function resourceTypeFor(_mimeType: string | null | undefined): "raw" {
  return "raw"
}

export interface StoredAsset {
  /** Cloudinary public_id, persisted in `CaseDocument.filePath`. */
  publicId: string
  /** Persisted in `CaseDocument.storageResourceType` — needed to sign and to destroy. */
  resourceType: string
  /** Cloudinary's own byte count, used in preference to the client-reported size. */
  bytes: number
}

/**
 * Upload a document buffer. `fileName` should already be sanitised by the
 * caller; it is used only to build a readable public_id.
 */
export async function uploadDocument(
  buffer: Buffer,
  opts: { caseId: string; fileName: string; mimeType: string | null }
): Promise<StoredAsset> {
  const api = client()
  const resourceType = resourceTypeFor(opts.mimeType)

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = api.uploader.upload_stream(
      {
        folder: `${ROOT_FOLDER}/${opts.caseId}`,
        public_id: opts.fileName,
        resource_type: resourceType,
        // Private by default — a bare delivery URL 401s without a signature.
        type: "authenticated",
        // The caller already prefixes a timestamp, so the name is unique and
        // should be preserved rather than suffixed again by Cloudinary.
        use_filename: false,
        unique_filename: false,
        overwrite: false,
      },
      (error, uploaded) => {
        if (error) return reject(error)
        if (!uploaded) return reject(new Error("Cloudinary returned no upload result."))
        resolve(uploaded)
      }
    )
    stream.end(buffer)
  })

  // Store what Cloudinary actually used rather than what we asked for — for
  // raw uploads it decides how the extension lands in the public_id.
  return {
    publicId: result.public_id,
    resourceType: result.resource_type ?? resourceType,
    bytes: result.bytes ?? buffer.byteLength,
  }
}

/**
 * A signed, short-lived, server-side-only URL for reading an authenticated
 * asset. Never return this to a client — it bypasses the app's access checks.
 *
 * This deliberately uses the `private_download_url` API endpoint rather than a
 * signed CDN delivery URL. Cloudinary accounts restrict delivery of PDF and
 * ZIP files by default, so a signed delivery URL returns 401 for exactly the
 * file type a legal chamber uploads most — verified against this account: a
 * `.txt` asset delivered fine while every `.pdf` 401'd. The download endpoint
 * is not subject to that setting, so documents work with no console changes.
 */
export function signedDownloadUrl(publicId: string, resourceType: string | null | undefined): string {
  const api = client()
  const type = resourceType || "raw"
  // `raw` public_ids carry their own extension, so the format argument is
  // empty. A legacy `image` row keeps its extension here instead.
  const format = type === "raw" ? "" : (publicId.split(".").pop() ?? "")
  return api.utils.private_download_url(publicId, format, {
    resource_type: type,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SECONDS,
  })
}

/** Best-effort removal. Callers must not let a storage failure block the DB delete. */
export async function deleteDocument(
  publicId: string,
  resourceType: string | null | undefined
): Promise<void> {
  const api = client()
  await api.uploader.destroy(publicId, {
    resource_type: resourceType || "raw",
    type: "authenticated",
    invalidate: true,
  })
}
