import type { Metadata } from "next";
import { Bodoni_Moda, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// "Nightcap" type system. Bodoni Moda is a dramatic, high-contrast fashion-
// editorial serif (the headline voice) - nothing like Fraunces or the generic
// AI serif. Hanken Grotesk is the warm body grotesque. JetBrains Mono sets the
// small-caps "concierge stamp" eyebrow labels for an editorial, stamped feel.
const display = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
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
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster position="top-center" theme="dark" toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
      </body>
    </html>
  );
}
