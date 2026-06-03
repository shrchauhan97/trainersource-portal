import * as Sentry from "@sentry/nextjs";

// Node.js runtime Sentry init. DSN is read from the (non-public) SENTRY_DSN
// env var so it is never bundled into client output. When unset, Sentry stays
// inert — safe for local/preview environments without a DSN configured.
Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Capture 100% of traces in development, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Only emit Sentry's own diagnostic logs when explicitly debugging.
  debug: false,
});
