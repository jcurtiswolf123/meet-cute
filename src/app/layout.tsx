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
  // The public origin, which every absolute metadata URL is resolved against.
  // The fallback has to be the real domain: NEXT_PUBLIC_SITE_URL is not set in
  // production, so a fly.dev fallback is what shipped, and every link shared to
  // a chat app pulled its preview image from meet-cute.fly.dev.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com",
  ),
  title: {
    default: "Mutuals - curated matchmaking",
    template: "%s · Mutuals",
  },
  description:
    "Curated, one-to-one introductions made by a real matchmaker in New York and San Francisco.",
  openGraph: {
    title: "Mutuals - curated matchmaking",
    description: "Meet your friend's friends. One introduction at a time.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-scroll-behavior opts the smooth scrolling in globals.css out of Next's
    // route transitions. Without it every navigation animated its scroll reset,
    // and Next warns about exactly this in the console.
    // suppressHydrationWarning covers one attribute and is not a licence to
    // ignore real mismatches: the iOS app injects data-native="ios" here at
    // document start so the CSS that hides the web sidebar applies on the
    // first paint, which React then reads as a server/client difference and
    // logged on every page load in the app.
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <head>
        {/* Scroll reveals render at opacity 0 and are animated in by the client
            bundle. Without JavaScript nothing would ever reveal them, leaving the
            marketing pages blank below the hero, so force them visible instead. */}
        <noscript>
          <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
        </noscript>
      </head>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
