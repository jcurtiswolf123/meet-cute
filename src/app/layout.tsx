import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// "Warm Daylight" type system. Fraunces is a soft, warm, high-optical-contrast
// old-style serif with real personality (gentle wedge serifs, friendly curves)
// that reads inviting rather than icy-formal. Hanken Grotesk is the warm humanist
// body grotesque. JetBrains Mono sets the small-caps eyebrow labels.
const display = Fraunces({
  subsets: ["latin"],
  style: "normal",
  variable: "--font-display",
  display: "optional",
});

const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "optional",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "optional",
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
    images: [{ url: "/og.jpg", width: 1408, height: 768, alt: "Two people laughing over coffee" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.jpg"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
