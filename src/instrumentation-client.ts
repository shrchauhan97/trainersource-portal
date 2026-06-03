import * as Sentry from "@sentry/nextjs";

// Client-side instrumentation entrypoint (Next.js 16 `instrumentation-client`
// file convention). Runs after the document loads but before React hydration.
// DSN is read from the public env var so it is available in the browser bundle.
// When unset, Sentry stays inert — safe for local/preview environments.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 100% of traces in development, 10% in production.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  debug: false,
});

// Instruments client-side router navigations for tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
