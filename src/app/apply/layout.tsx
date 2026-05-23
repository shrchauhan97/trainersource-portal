import type { Metadata } from "next";
import type { ReactNode } from "react";

// T4.2/T4.3 — apply/page.tsx is a 'use client' module (uses useActionState),
// so we can't export `metadata` from it. A sibling server-component layout
// applies the title + OG/Twitter tags without forcing the form to be a server
// component.
export const metadata: Metadata = {
  title: "Apply",
  description:
    "Apply to become a TrainerSource partner — short application, fast review.",
  openGraph: {
    title: "Apply — TrainerSource",
    description:
      "Apply to become a TrainerSource partner — short application, fast review.",
    url: "/apply",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "TrainerSource" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Apply — TrainerSource",
    description:
      "Apply to become a TrainerSource partner — short application, fast review.",
    images: ["/api/og"],
  },
};

export default function ApplyLayout({ children }: { children: ReactNode }) {
  return children;
}
