"use client";

import Link from "next/link";
import { startOver, useAutoStartOver } from "@/components/Recovery";

/**
 * The boundary a hydrated page lands on.
 *
 * It used to offer `reset()` and nothing else, which is the one recovery that
 * cannot fix the error people actually hit here. After a deploy, a page the
 * browser is already holding posts a server action id the running build has
 * never heard of; Next refuses it and the router throws. `reset()` re-renders
 * that same stale bundle, which sends the same dead id, which fails
 * identically. "Try again" was a closed loop with no exit anyone on a phone
 * would guess. An applicant hit exactly this on 4 August, pressed it several
 * times, and stopped applying. Six deploys went out that day.
 *
 * See src/components/Recovery.tsx for the cure and why it is the only one.
 *
 * A fresh document is safe here because the application saves each answer to
 * the row as it is given: /apply reads the furthest step answered and redraws
 * exactly it, on any device. Nothing typed is lost by starting over.
 */
export default function Error({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useAutoStartOver();

  return (
    <main className="container-mc flex min-h-screen flex-col items-start justify-center">
      <p className="label text-claret">Temporary error</p>
      <h1 className="mt-6 font-display text-3xl font-medium tracking-tight">
        Something went sideways.
      </h1>
      <p className="mt-2 max-w-[44ch] text-muted">
        A momentary hiccup on our end. Start over below and you will land back
        where you stopped, with nothing lost. If it happens again, your
        matchmaker is one message away.
      </p>
      <div className="mt-7 flex gap-3">
        {/* A fresh document, not `reset()`. Re-rendering the page we are
            already holding is precisely what cannot fix the most common reason
            anyone reads this screen. */}
        <button onClick={startOver} className="btn-primary px-7 py-3">
          Try again
        </button>
        <Link href="/" className="btn-ghost px-7 py-3">
          Back home
        </Link>
      </div>
      {/* Production strips the message and leaves only a digest. Showing it
          turns "it kept erroring" into a line someone can find in Sentry. */}
      {error.digest && (
        <p className="mt-6 text-xs text-muted">Reference {error.digest}</p>
      )}
    </main>
  );
}
