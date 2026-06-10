import * as Sentry from "@sentry/nextjs";

// Server-side instrumentation entrypoint (Next.js 16 `instrumentation` file
// convention). `register` runs once per server instance; we lazy-import the
// runtime-specific Sentry init so the Node and Edge SDKs are only loaded where
// they apply (see src/sentry.server.config.ts / src/sentry.edge.config.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown in Server Components, Route Handlers, Server Actions,
// middleware, and proxies and forwards them to Sentry.
export const onRequestError = Sentry.captureRequestError;
