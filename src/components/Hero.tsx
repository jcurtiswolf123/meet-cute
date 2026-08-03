import Link from "next/link";

// A dark, editorial opener: type and negative space carry it (no hero photo, per
// DESIGN.md). The ink field + cream serif is the single biggest lever toward the
// quiet-members-club posture and away from a generic light landing page.
export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-ink text-cream">
      <div className="container-mc flex min-h-[46rem] flex-col justify-end pb-16 pt-40 sm:min-h-[52rem] sm:pb-20 sm:pt-48">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-9">
            <p className="public-label text-cream/55">
              By application · New York &amp; San Francisco
            </p>
            <h1 className="mt-7 max-w-[13ch] font-display text-[3.75rem] font-normal leading-[0.9] tracking-[-0.03em] sm:text-[6rem] lg:text-[7.5rem]">
              Meet someone worth knowing.
            </h1>
          </div>

          <div className="lg:col-span-3 lg:pb-2">
            <p className="max-w-[34rem] text-lg leading-8 text-cream/70">
              A real matchmaker makes every introduction. One person at a time. No public profile,
              no feed, no endless swiping.
            </p>
            <div className="mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <Link href="/apply" className="btn inline-flex bg-cream px-7 py-3.5 text-ink hover:bg-cream/85">
                Request membership
              </Link>
              <Link
                href="/dinners"
                className="inline-flex min-h-11 items-center border-b border-cream/40 text-sm font-semibold text-cream transition-colors hover:border-cream"
              >
                Join us for dinner
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-4 border-t border-cream/15 pt-6 text-sm text-cream/60 lg:grid-cols-4">
          <p>By application</p>
          <p>Private by default</p>
          <p>Mutual by design</p>
          <p className="lg:text-right">Introduced, not swiped</p>
        </div>
      </div>
    </section>
  );
}
