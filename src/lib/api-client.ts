// Thin fetch wrapper for the AinSheba API.
// All endpoints respond `{ data: ... }` on success and
// `{ error: { message, code } }` on failure.

/**
 * Fired whenever any API call returns 401 so the app shell can reset to the
 * login screen instead of leaving the user stranded on a dead session.
 */
export const SESSION_EXPIRED_EVENT = "lcm:session-expired"

function notifySessionExpired() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
  }
}

function fallbackByStatus(status: number): string {
  switch (status) {
    case 400:
      return "Invalid request."
    case 401:
      return "Your session has expired. Please sign in again."
    case 403:
      return "You do not have permission to perform this action."
    case 404:
      return "The requested record was not found."
    case 409:
      return "This conflicts with an existing record."
    case 422:
      return "The submitted data is invalid."
    case 429:
      return "Too many attempts. Please wait a moment and try again."
    case 500:
      return "Something went wrong on the server. Please try again."
    default:
      return `Request failed (HTTP ${status}).`
  }
}

async function throwApiError(res: Response): Promise<never> {
  let message = ""
  try {
    const json = (await res.json()) as { error?: { message?: string } } | null
    message = json?.error?.message ?? ""
  } catch {
    // non-JSON body — fall through to status-based message
  }
  if (res.status === 401) notifySessionExpired()
  throw new Error(message || fallbackByStatus(res.status))
}

async function readData<T>(res: Response): Promise<T> {
  try {
    const json = (await res.json()) as { data?: T } | null
    return (json ? json.data : null) as T
  } catch {
    return null as T
  }
}

/** GET a path and unwrap `{ data }`. Throws Error(message) on non-ok. */
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, {
    method: "GET",
    credentials: "same-origin",
  })
  if (!res.ok) await throwApiError(res)
  return readData<T>(res)
}

/** POST / PATCH / DELETE with an optional JSON body. Unwraps `{ data }`. */
export async function apiSend<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) await throwApiError(res)
  return readData<T>(res)
}

/** POST multipart FormData (file uploads). Unwraps `{ data }`. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    body: form,
  })
  if (!res.ok) await throwApiError(res)
  return readData<T>(res)
}
