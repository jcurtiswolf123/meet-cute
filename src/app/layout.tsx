import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

// Display was Instrument Serif until 2026-08-15. At headline sizes it read as
// a wedding invitation rather than as a product, which is the opposite of what
// a curated service is selling, and the iOS app inherited it in every web view.
// Bricolage Grotesque is set tight and heavy instead: it carries the same
// editorial weight without the script feel, and it is the face bundled in the
// app so native chrome and web content speak once. See DESIGN.md.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
  // Installed to a home screen, the app is "Mutuals", not the SEO title.
  applicationName: "Mutuals",
  appleWebApp: {
    capable: true,
    title: "Mutuals",
    // The bar behind the status bar takes the page's own colour instead of
    // black, which is what `default` gives on a cream page.
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

// `viewport-fit=cover` is what lets the app paint under the notch and the home
// indicator, which is the point of a standalone install; the `env(safe-area-*)`
// padding in globals.css and the portal bars is what keeps content out of them.
// `maximumScale` is deliberately absent: capping zoom locks out anybody who
// needs to enlarge text.
export const viewport: Viewport = {
  themeColor: "#f4f1ea",
  colorScheme: "light",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
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
        {/* Next emits the modern `mobile-web-app-capable`, which Safari has
            treated as an alias since iOS 16.4. The legacy spelling is what
            anything older reads, and without it the icon opens in a browser tab
            rather than as an app. One tag, so both are covered. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* Scroll reveals render at opacity 0 and are animated in by the client
            bundle. Without JavaScript nothing would ever reveal them, leaving the
            marketing pages blank below the hero, so force them visible instead. */}
        <noscript>
          <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
        </noscript>
      </head>
      <body className="font-sans antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
