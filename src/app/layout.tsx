import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TS TRAINERSOURCE",
  description: "Delivering the products your clients need",
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
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className="min-h-full flex flex-col font-body">
        {children}
        <footer className="mt-auto border-t border-gray-200 bg-gray-50 px-4 py-3 text-center">
          <p className="text-xs text-gray-500">
            All products referenced are intended for research purposes only. Not for human consumption. You must be 21 or older to access our products. © {new Date().getFullYear()} TrainerSource. All rights reserved.
          </p>
        </footer>
      </body>
    </html>
  );
}
