import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn11.bigcommerce.com", pathname: "/**" },
      { protocol: "https", hostname: "cdn.bigcommerce.com", pathname: "/**" },
    ],
  },
};

// Sentry build-time wrapper. Org/project/auth-token are read from env so no
// secrets live in source; source-map upload only runs when SENTRY_AUTH_TOKEN
// is present (e.g. in CI / Vercel build). Logs stay quiet outside CI.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
});
