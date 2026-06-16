import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Distinctive, editorial pairing (no Inter / system-default tell): Fraunces is a
// characterful old-style display serif; Hanken Grotesk is a warm, slightly
// humanist grotesque for UI and body that reads friendlier than Inter.
const display = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://meet-cute.fly.dev"),
  title: {
    default: "Meet Cute - premium matchmaking",
    template: "%s · Meet Cute",
  },
  description: "We help you meet, date, and stay together. Curated introductions, by invitation only. NYC and SF.",
  openGraph: {
    title: "Meet Cute - premium matchmaking",
    description: "We help you meet, date, and stay together. By introduction only.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster position="top-center" toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
      </body>
    </html>
  );
}
