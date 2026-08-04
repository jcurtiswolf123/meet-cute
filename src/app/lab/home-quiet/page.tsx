import Link from "next/link";

export const metadata = { title: "Lab: quiet", robots: { index: false, follow: false } };

// C. Almost no imagery at all.
//
// Type, rule lines and negative space, with one photograph used as a band
// rather than a backdrop. The argument for it: a matchmaking service that opens
// with a big romantic picture is making a promise about the pictures; one that
// opens with a sentence is making a promise about the introductions. It is also
// the fastest page of the three by an order of magnitude.
export default function HomeQuiet() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="container-mc flex items-center justify-between py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink">Mutuals</p>
        <Link href="/lab" className="text-xs text-muted underline underline-offset-4">
          Back to the lab
        </Link>
      </div>

      <section className="container-mc max-w-4xl pb-section-sm pt-section-sm">
        <h1 className="font-display text-6xl font-medium leading-[1.02] tracking-tight sm:text-7xl">
          Two friends
          <br />
          vouch for you.
          <br />
          <span className="text-claret">Then we introduce you.</span>
        </h1>
        <p className="mt-10 max-w-[52ch] text-xl leading-relaxed text-muted">
          Curated matchmaking in New York, San Francisco and Los Angeles. No feed, no swiping, no
          profile to keep polished. One introduction at a time, by email, and you decide for
          yourself.
        </p>
        <div className="mt-10">
          <Link href="/apply" className="btn-primary px-8 py-3.5 text-base">
            Apply to join
          </Link>
        </div>
      </section>

      {/* One image, as a band, doing one job: showing the kind of room this
          ends up in rather than the kind of person. */}
      <div
        className="h-[38vh] w-full bg-cover bg-center"
        style={{ backgroundImage: "url(/generated/hero-letter.webp)" }}
        role="img"
        aria-label="A handwritten letter beside a cup of coffee on a dark table"
      />

      <section className="container-mc max-w-4xl py-section-md">
        <dl className="divide-y divide-line border-y border-line">
          {[
            ["Who gets in", "Anyone two friends of the opposite gender will write a few sentences for. That is the whole review."],
            ["What we do", "A matchmaker reads those words and introduces you to one person at a time."],
            ["What you do", "Say yes or pass, privately. A mutual yes connects you by email and the rest is yours."],
          ].map(([term, def]) => (
            <div key={term} className="grid gap-3 py-7 sm:grid-cols-[14rem_1fr]">
              <dt className="label pt-1">{term}</dt>
              <dd className="max-w-[56ch] text-lg leading-relaxed text-ink">{def}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
