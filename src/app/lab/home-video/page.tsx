import Link from "next/link";

export const metadata = { title: "Lab: video hero", robots: { index: false, follow: false } };

// A. The room, moving.
//
// Eight seconds of a table by a window, generated to the palette in DESIGN.md:
// nobody in frame, no cut, one slow change of light. A hero loop is watched a
// hundred times by the same person, so it has to be atmosphere rather than a
// story: the moment it resolves into something, it starts to feel like an ad.
//
// The video is muted, inline, looped and posters immediately, and anyone who
// has asked for reduced motion gets the still and never downloads the file.
export default function HomeVideo() {
  return (
    <main className="min-h-screen bg-ink text-cream">
      <section className="relative isolate flex min-h-[92vh] flex-col justify-end overflow-hidden">
        <video
          className="absolute inset-0 -z-10 h-full w-full object-cover motion-reduce:hidden"
          poster="/generated/hero-poster.webp"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        >
          <source src="/generated/hero-loop-web.mp4" type="video/mp4" />
        </video>
        {/* The still is the whole hero when motion is unwelcome, and the
            fallback if the file never arrives. */}
        <div
          className="absolute inset-0 -z-10 hidden bg-cover bg-center motion-reduce:block"
          style={{ backgroundImage: "url(/generated/hero-poster.webp)" }}
        />
        {/* Ink wash rather than a gradient scrim: DESIGN.md bans gradients, and
            text over film needs to be readable on every frame of the loop. */}
        <div className="absolute inset-0 -z-10 bg-ink/55" />

        <div className="container-mc pb-16 pt-24">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cream/70">Mutuals</p>
          <h1 className="mt-6 max-w-[15ch] font-display text-6xl font-medium leading-[1.02] tracking-tight sm:text-7xl">
            Meet your friend&rsquo;s friends.
          </h1>
          <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-cream/80">
            Curated matchmaking in New York, San Francisco and Los Angeles. Two friends vouch for
            you, a matchmaker introduces you to one person at a time, and you decide for yourself.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/apply"
              className="inline-flex min-h-11 items-center rounded-full bg-cream px-7 text-sm font-semibold text-ink transition duration-200 ease-soft hover:bg-champagne-soft"
            >
              Apply to join
            </Link>
            <Link href="/lab" className="text-sm text-cream/70 underline underline-offset-4">
              Back to the lab
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-cream py-section-md text-ink">
        <div className="container-mc grid gap-12 lg:grid-cols-[5fr_7fr]">
          <h2 className="font-display text-4xl font-medium leading-tight tracking-tight">
            Nobody gets in on their own say-so.
          </h2>
          <div className="max-w-[58ch] space-y-5 text-lg leading-relaxed text-muted">
            <p>
              You name two friends of the opposite gender. We email them, they write a few
              sentences, and the moment both answer you are a member. There is nobody to impress in
              between, and no profile to keep polished.
            </p>
            <p className="text-ink">
              What they write is what the person we introduce you to actually reads.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
