/**
 * Bearer-token fallback switch (default: OFF).
 *
 * The httpOnly session cookie is the only auth carrier in a normal deployment.
 * Some embedding contexts — notably the sandbox preview panel, which renders
 * the app inside a cross-site iframe — block SameSite=Lax cookies outright, so
 * the app can also carry the session as an `Authorization: Bearer` header with
 * the token mirrored into localStorage.
 *
 * That mirror is a real weakening: a token in localStorage is readable by any
 * script on the page, so an XSS becomes a 7-day session theft, which is
 * precisely what httpOnly exists to prevent. It is therefore opt-in and stays
 * off unless NEXT_PUBLIC_ENABLE_BEARER_FALLBACK is explicitly "true".
 *
 * When disabled: the login response carries no token, the client stores and
 * sends nothing, and the server ignores Authorization headers entirely.
 */
export const BEARER_FALLBACK_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_BEARER_FALLBACK === "true"
