import Link from "next/link";

export const metadata = { title: "Lab: editorial", robots: { index: false, follow: false } };

// B. Photographic and editorial.
//
// No video and no full-bleed hero. An asymmetric 5/7 split, one large still,
// and the type doing the work: closest to a magazine opening spread, and the
// cheapest of the three to load. The images are generated to the palette, are
// deliberately empty of people, and never show a couple looking at the camera,
// which is the single most common way a dating site starts to look like stock.
export default function HomeEditorial() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="container-mc py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink">Mutuals</p>
      </div>

      <section className="container-mc grid items-end gap-10 pb-section-sm lg:grid-cols-[5fr_7fr]">
        <div>
          <h1 className="font-display text-5xl font-medium leading-[1.05] tracking-tight sm:text-6xl">
            Meet your
            <br />
            friend&rsquo;s friends.
          </h1>
          <p className="mt-6 max-w-[42ch] text-lg leading-relaxed text-muted">
            Curated matchmaking in New York, San Francisco and Los Angeles.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/apply" className="btn-primary px-7 py-3">
              Apply to join
            </Link>
            <Link href="/lab" className="text-sm text-muted underline underline-offset-4">
              Back to the lab
            </Link>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/generated/hero-table.webp"
          alt="A table for two by a window in the late afternoon"
          className="aspect-[5/4] w-full rounded-xl2 object-cover"
        />
      </section>

      <section className="border-y border-line bg-paper/50 py-section-sm">
        <div className="container-mc grid gap-10 sm:grid-cols-3">
          {[
            ["Two friends vouch", "You name two people of the opposite gender. We ask them, not you."],
            ["A matchmaker pairs", "One introduction at a time, by email. No feed, no swiping."],
            ["You decide", "Say yes or pass on your own. A mutual yes connects you."],
          ].map(([title, body], i) => (
            <div key={title}>
              <p className="font-display text-3xl leading-none text-claret tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </p>
              <p className="mt-3 font-medium text-ink">{title}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container-mc grid items-center gap-10 py-section-md lg:grid-cols-[7fr_5fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/generated/hero-walk.webp"
          alt="Two people walking apart on a wide sidewalk at golden hour"
          className="aspect-[16/10] w-full rounded-xl2 object-cover"
        />
        <div>
          <h2 className="font-display text-4xl font-medium leading-tight tracking-tight">
            Nobody gets in on their own say-so.
          </h2>
          <p className="mt-5 max-w-[46ch] text-lg leading-relaxed text-muted">
            Two friends write a few sentences about you, and the moment both answer you are a
            member. What they write is what the person we introduce you to actually reads.
          </p>
        </div>
      </section>
    </main>
  );
}
