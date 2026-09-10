/**
 * One-off migration: local disk uploads -> Cloudinary.
 *
 *   node scripts/migrate-uploads-to-cloudinary.mjs [--dry-run]
 *
 * Moves every CaseDocument still stored on local disk (storageProvider IS
 * NULL) into Cloudinary as an `authenticated` asset, then points the row at
 * the new public_id.
 *
 * Safe to re-run: rows already carrying storageProvider = 'CLOUDINARY' are
 * skipped, and a row is only updated after its upload succeeds. Local files
 * are left in place — verify downloads first, then delete `uploads/` by hand.
 */

import { readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

import { PrismaClient } from "@prisma/client"
import { v2 as cloudinary } from "cloudinary"

const DRY_RUN = process.argv.includes("--dry-run")

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error(
    "Missing Cloudinary credentials. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET."
  )
  process.exit(1)
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
})

const db = new PrismaClient()
const UPLOADS_ROOT = path.join(process.cwd(), "uploads")
const ROOT_FOLDER = "ainsheba/cases"

/** Mirrors resolveUploadPath in src/lib/uploads.ts, including the containment check. */
function resolveUploadPath(stored) {
  if (!stored) return null
  let candidate = stored
  const normalised = stored.replace(/\\/g, "/")
  const marker = normalised.lastIndexOf("/uploads/")
  if (marker !== -1) candidate = normalised.slice(marker + "/uploads/".length)
  else if (path.isAbsolute(stored)) candidate = stored

  const abs = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(UPLOADS_ROOT, candidate)
  const root = path.resolve(UPLOADS_ROOT)
  if (abs !== root && !abs.startsWith(root + path.sep)) return null
  return abs
}

/** Mirrors resourceTypeFor in src/lib/cloudinary.ts. */
function resourceTypeFor(mimeType) {
  return (mimeType ?? "").startsWith("image/") ? "image" : "raw"
}

function upload(buffer, { caseId, fileName, resourceType }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `${ROOT_FOLDER}/${caseId}`,
        public_id: fileName,
        resource_type: resourceType,
        type: "authenticated",
        use_filename: false,
        unique_filename: false,
        overwrite: false,
      },
      (error, result) => (error ? reject(error) : resolve(result))
    )
    stream.end(buffer)
  })
}

async function main() {
  const rows = await db.caseDocument.findMany({
    where: { storageProvider: null, filePath: { not: null } },
    select: { id: true, caseId: true, documentName: true, fileName: true, filePath: true, mimeType: true },
    orderBy: { createdAt: "asc" },
  })

  console.log(`${rows.length} local document(s) to migrate${DRY_RUN ? " (dry run)" : ""}.\n`)

  let migrated = 0
  let missing = 0
  let failed = 0

  for (const row of rows) {
    const abs = resolveUploadPath(row.filePath)
    const label = `${row.documentName} [${row.id}]`

    if (!abs) {
      console.warn(`  SKIP  ${label} — path escapes the uploads root: ${row.filePath}`)
      missing += 1
      continue
    }

    let buffer
    try {
      buffer = await readFile(abs)
    } catch {
      console.warn(`  SKIP  ${label} — file missing on disk: ${abs}`)
      missing += 1
      continue
    }

    // Keep the on-disk basename so public_ids stay recognisable.
    const baseName = path.basename(abs)
    const resourceType = resourceTypeFor(row.mimeType)

    if (DRY_RUN) {
      console.log(`  WOULD ${label} -> ${ROOT_FOLDER}/${row.caseId}/${baseName} (${resourceType}, ${buffer.byteLength} B)`)
      migrated += 1
      continue
    }

    try {
      const result = await upload(buffer, { caseId: row.caseId, fileName: baseName, resourceType })
      await db.caseDocument.update({
        where: { id: row.id },
        data: {
          filePath: result.public_id,
          storageProvider: "CLOUDINARY",
          storageResourceType: result.resource_type ?? resourceType,
          fileSize: result.bytes ?? buffer.byteLength,
        },
      })
      console.log(`  OK    ${label} -> ${result.public_id}`)
      migrated += 1
    } catch (e) {
      console.error(`  FAIL  ${label} — ${e?.message ?? e}`)
      failed += 1
    }
  }

  console.log(`\nmigrated=${migrated} missing=${missing} failed=${failed}`)
  if (!DRY_RUN && migrated > 0) {
    console.log("Verify a few downloads in the app before deleting the uploads/ directory.")
  }
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
