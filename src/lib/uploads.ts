import path from "path"

/**
 * Uploaded-file path handling.
 *
 * `CaseDocument.filePath` stores a path **relative to the uploads root**, using
 * forward slashes (e.g. `seed/<caseId>/<file>.pdf`). Absolute paths must never
 * be stored: they embed the machine's working directory, so every document
 * 404s as soon as the app moves to another directory, container or host.
 *
 * Everything that touches an upload goes through `resolveUploadPath`, which is
 * the single place that turns a stored value into a real filesystem path and
 * refuses anything escaping the uploads root.
 */
export const UPLOADS_ROOT = path.join(process.cwd(), "uploads")

/** Build the value to persist for a freshly written upload. */
export function storedUploadPath(caseId: string, savedFileName: string): string {
  return `${caseId}/${savedFileName}`
}

/** Absolute directory a case's uploads live in. */
export function caseUploadDir(caseId: string): string {
  return path.join(UPLOADS_ROOT, caseId)
}

/**
 * Resolve a stored `filePath` to an absolute path inside the uploads root.
 * Returns null when the value is empty or resolves outside the root.
 *
 * Legacy rows may hold an absolute path from an older deployment; those are
 * accepted only when they still land inside this installation's uploads root.
 */
export function resolveUploadPath(stored: string | null | undefined): string | null {
  if (!stored) return null

  // Legacy absolute values (either platform's separator) — keep the portion
  // after the last `uploads/` segment so they still resolve here.
  let candidate = stored
  const normalised = stored.replace(/\\/g, "/")
  const marker = normalised.lastIndexOf("/uploads/")
  if (marker !== -1) {
    candidate = normalised.slice(marker + "/uploads/".length)
  } else if (path.isAbsolute(stored)) {
    candidate = stored
  }

  const abs = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(UPLOADS_ROOT, candidate)

  // Containment check: the resolved path must sit inside the uploads root.
  const root = path.resolve(UPLOADS_ROOT)
  if (abs !== root && !abs.startsWith(root + path.sep)) return null

  return abs
}
