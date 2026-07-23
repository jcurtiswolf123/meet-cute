"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="container-mc flex min-h-screen flex-col items-start justify-center">
      <p className="label text-claret">Temporary error</p>
      <h1 className="mt-6 font-display text-3xl font-medium tracking-tight">
        Something went sideways.
      </h1>
      <p className="mt-2 max-w-[44ch] text-muted">
        A momentary hiccup on our end. Try again, and if it persists, your
        matchmaker is one message away.
      </p>
      <div className="mt-7 flex gap-3">
        <button onClick={reset} className="btn-primary px-7 py-3">
          Try again
        </button>
        <Link href="/" className="btn-ghost px-7 py-3">
          Back home
        </Link>
      </div>
    </main>
  );
}
