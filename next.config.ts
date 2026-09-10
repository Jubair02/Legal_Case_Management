import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * The app is normally never framed. The one exception is the sandbox preview
 * panel, which embeds it in a cross-site iframe — the same context the Bearer
 * fallback exists for, so both are driven by the one switch.
 */
const allowEmbedding = process.env.NEXT_PUBLIC_ENABLE_BEARER_FALLBACK === "true";

const csp = [
  "default-src 'self'",
  // Next's bootstrap and hydration payloads are inline; dev additionally needs
  // eval for the webpack/HMR runtime.
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  // next/font self-hosts, so no external font origin is required.
  "font-src 'self' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  allowEmbedding ? "frame-ancestors *" : "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: allowEmbedding ? "ALLOWALL" : "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  // Chamber data is confidential; pin HTTPS once in production.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

/**
 * Standalone output exists for the self-hosted path only: `npm start` runs
 * `.next/standalone/server.js`. Vercel traces and bundles the app itself, so
 * there it is pure cost — it duplicates node_modules (~100 MB, Prisma's query
 * engine included) inside `.next`, which counts against the serverless
 * function size limit and buys nothing.
 */
const isVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  output: isVercel ? undefined : "standalone",
  /* config options here */
  // Type errors fail the build on purpose: two shipped crashes
  // (INVOICE_STATUS_LABELS / HEARING_STATUS_LABELS were undefined) had both
  // been caught by tsc and suppressed here.
  reactStrictMode: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
