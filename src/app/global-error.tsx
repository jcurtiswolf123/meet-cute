"use client";

import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import { startOver, useAutoStartOver } from "@/components/Recovery";
import "./globals.css";

/**
 * The last boundary: a failure in the root layout itself, which `error.tsx`
 * sits inside and therefore cannot catch. Without this the response is a bare
 * white page reading "Internal Server Error".
 *
 * It carries the same recovery as error.tsx because the useful thing to do
 * about a page that will not render is to fetch it again, and after a deploy
 * that is also the thing that fixes it.
 *
 * What it does NOT catch, despite the guess that put this file here: a stale
 * server action posted natively before React hydrates. That throw happens
 * inside Next's action handler before any render begins, so no React boundary
 * runs and the response is the bare 500 regardless. Measured, not assumed. See
 * src/components/Recovery.tsx for why that gap is left open.
 *
 * global-error replaces the root layout, so this owns its own html and body and
 * loads the stylesheet and fonts itself.
 */

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

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useAutoStartOver();

  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>
        <main className="container-mc flex min-h-screen flex-col items-start justify-center">
          <p className="label text-claret">Temporary error</p>
          <h1 className="mt-6 font-display text-3xl font-medium tracking-tight">
            Something went sideways.
          </h1>
          <p className="mt-2 max-w-[44ch] text-muted">
            A momentary hiccup on our end. Start over below and you will land
            back where you stopped, with nothing lost. If it happens again, your
            matchmaker is one message away.
          </p>
          <div className="mt-7 flex gap-3">
            <button onClick={startOver} className="btn-primary px-7 py-3">
              Try again
            </button>
            {/* A plain anchor, not next/link, and the lint rule that wants
                otherwise is wrong here. This boundary replaces the root layout
                because the render never got far enough to build one, so the
                client router this page would need is part of what failed. A
                document navigation is the point, not an oversight. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="btn-ghost px-7 py-3">
              Back home
            </a>
          </div>
          {error.digest && (
            <p className="mt-6 text-xs text-muted">Reference {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
