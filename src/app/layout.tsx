import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "optional",
});

const sans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
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
    default: "Meet Cute - private matchmaking",
    template: "%s · Meet Cute",
  },
  description:
    "Private, one-to-one introductions made by a real matchmaker in New York and San Francisco.",
  openGraph: {
    title: "Meet Cute - private matchmaking",
    description: "Meet someone worth knowing. One private introduction at a time.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
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
