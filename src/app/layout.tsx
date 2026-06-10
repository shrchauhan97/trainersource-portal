import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

// T4.2 — Per-route titles. Every child page.tsx / layout.tsx sets a short
// `title` string and Next's title.template wraps it as "<page> — TrainerSource".
// Pages that want a custom standalone title (e.g. /r/[code]) use title.absolute.
// T4.3 — Default OG/Twitter metadata. Per-route pages override description and
// (where applicable) point at the dynamic /api/og endpoint. metadataBase makes
// relative OG image URLs resolve correctly when the file is fetched server-side
// by a social platform crawler.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trainer-source.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "TrainerSource",
    template: "%s — TrainerSource",
  },
  description:
    "TrainerSource — helping professional trainers discover professional products.",
  openGraph: {
    title: "TrainerSource",
    description:
      "TrainerSource — helping professional trainers discover professional products.",
    url: SITE_URL,
    siteName: "TrainerSource",
    type: "website",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "TrainerSource",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TrainerSource",
    description:
      "TrainerSource — helping professional trainers discover professional products.",
    images: ["/api/og"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakartaSans.variable} h-full antialiased`}
    >
      <head>
        {/* Material Symbols is an icon font, not body text — display=block
            avoids a flash of ligature names before it loads. The root layout
            <head> is the correct place for it in the App Router, so the two
            next/font page-font lints (tuned for next/font text fonts) don't
            apply here. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
        />
      </head>
      <body className="min-h-full flex flex-col font-body">
        {children}
        <Analytics />
        <SpeedInsights />
        <footer className="mt-auto border-t border-gray-200 bg-gray-50 px-4 py-3 text-center">
          <p className="text-xs text-gray-500">
            All products referenced are intended for research purposes only. Not for human consumption. You must be 21 or older to access our products. © {new Date().getFullYear()} TrainerSource. All rights reserved.
          </p>
        </footer>
      </body>
    </html>
  );
}
