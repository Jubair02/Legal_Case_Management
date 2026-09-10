"use client"

/**
 * Last-resort boundary: catches failures in the root layout itself.
 *
 * When this renders, the root layout has been replaced — which means the font
 * variables and, on some failure paths, globals.css are not guaranteed to be
 * present. So it ships its own <html>/<body> and every style inline, and it
 * stays in English: the LanguageProvider lives below the root layout and
 * cannot be relied on here either.
 *
 * Anything richer belongs in (app)/error.tsx, which keeps the whole shell.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          backgroundColor: "#fbfaf7",
          color: "#1c2b25",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: "26rem",
            textAlign: "center",
            border: "1px solid #e6e3dc",
            borderRadius: "0.75rem",
            background: "#ffffff",
            padding: "2rem 1.5rem",
            boxShadow: "0 10px 26px -14px rgba(20, 50, 40, 0.18)",
          }}
        >
          {/* The balance-scale mark, inlined — no component tree to rely on. */}
          <svg
            viewBox="0 0 32 32"
            role="img"
            aria-label="AinSheba"
            style={{ width: 44, height: 44, borderRadius: 10 }}
          >
            <rect width="32" height="32" rx="7" fill="#07845f" />
            <g fill="#ffffff">
              <circle cx="16" cy="6.2" r="2.1" />
              <rect x="4" y="7.8" width="24" height="3" rx="1.5" />
              <rect x="14.5" y="8.6" width="3" height="14.4" rx="1.5" />
              <path d="M9.2 26.4 L11.9 22.6 L20.1 22.6 L22.8 26.4 Z" />
            </g>
          </svg>

          <h1
            style={{
              margin: "1rem 0 0",
              fontSize: "1.25rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              margin: "0.5rem auto 0",
              maxWidth: "20rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#5b6560",
            }}
          >
            AinSheba could not start. Reloading usually clears it. If it keeps happening, pass the
            reference below to your administrator.
          </p>

          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              cursor: "pointer",
              border: 0,
              borderRadius: "0.5rem",
              background: "#0a6b4f",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              padding: "0.625rem 1.25rem",
            }}
          >
            Try again
          </button>

          {error.digest ? (
            <p
              style={{
                margin: "1.25rem 0 0",
                fontSize: "0.6875rem",
                color: "#8b938e",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
