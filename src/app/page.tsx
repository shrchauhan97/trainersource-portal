import type { Metadata } from "next";
import Sidebar from "@/components/landing/Sidebar";
import MainContent from "@/components/landing/MainContent";

// T4.2/T4.3 — Landing page gets a brand-forward title.absolute (skip the
// template suffix so search results read "TrainerSource — partner with us"
// instead of doubling the brand name). Description doubles as the OG/Twitter
// preview text. Image points at the dynamic /api/og endpoint (no code → falls
// back to the generic TrainerSource card).
export const metadata: Metadata = {
  title: {
    absolute: "TrainerSource — partner with us",
  },
  description:
    "Partner with TrainerSource — earn lifetime commissions referring clients to Ultimate Peptides.",
  openGraph: {
    title: "TrainerSource — partner with us",
    description:
      "Partner with TrainerSource — earn lifetime commissions referring clients to Ultimate Peptides.",
    url: "/",
    type: "website",
    images: [{ url: "/api/og", width: 1200, height: 630, alt: "TrainerSource" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TrainerSource — partner with us",
    description:
      "Partner with TrainerSource — earn lifetime commissions referring clients to Ultimate Peptides.",
    images: ["/api/og"],
  },
};

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen w-full flex-col lg:flex-row">
      <Sidebar />
      <MainContent />
    </div>
  );
}
