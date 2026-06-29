import Link from "next/link";
import { Hero } from "@/components/Hero";
import { Reveal } from "@/components/motion";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [couples, members, dinners] = await Promise.all([
    prisma.match.count({ where: { stage: "relationship" } }),
    prisma.person.count({ where: { isOperator: false, isAmbassador: false, isCoach: false, status: "active" } }),
    prisma.dinner.count(),
  ]);

  return (
    <main className="min-h-screen">
      <SiteHeader />

      <Hero members={members} couples={couples} dinners={dinners} />

      {/* how it works: an editorial contents strip, hairline-divided. Not a row
          of identical icon-in-circle cards. */}
      <section className="border-y border-line bg-paper/40 py-section-lg">
        <div className="container-mc">
          <Reveal>
            <p className="kicker mb-3">How it works</p>
            <h2 className="max-w-[18ch] font-display text-4xl font-medium leading-tight tracking-tight md:text-5xl">
              Warm, simple, human.
            </h2>
          </Reveal>
          <div className="mt-12 grid divide-y divide-line border-t border-line md:grid-cols-4 md:divide-x md:divide-y-0 md:border-t-0">
            {[
              { n: "01", h: "Meet", b: "A real matchmaker gets to know you and hand-picks introductions, one at a time." },
              { n: "02", h: "Date", b: "Our concierge books a real table, so the first date actually happens." },
              { n: "03", h: "Build", b: "Coaching to help things go well, for members and friends alike." },
              { n: "04", h: "Belong", b: "Easy monthly dinners where you meet good people. No pressure." },
            ].map(({ n, h, b }, i) => (
              <Reveal key={h} delay={i * 0.08}>
                <div className="flex h-full flex-col gap-3 py-6 md:px-6 md:py-2 md:first:pl-0">
                  <span className="font-mono text-xs tracking-[0.2em] text-ember/70">{n}</span>
                  <h3 className="font-display text-2xl font-medium">{h}</h3>
                  <p className="text-[15px] leading-relaxed text-muted">{b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* testimonials: one big editorial pull-quote, then a hairline-divided trio.
          Replaces the marquee of identical cards (the AI-slop tell). */}
      <section className="py-section-lg">
        <div className="container-mc">
          <Reveal>
            <p className="kicker">From the roster</p>
          </Reveal>
          <Reveal delay={0.06}>
            <figure className="mt-6 max-w-4xl">
              <blockquote className="font-display text-3xl font-medium leading-[1.2] tracking-tight text-ink md:text-5xl md:leading-[1.15]">
                <span className="text-ember">&ldquo;</span>We were both done with the apps. Three weeks
                after our first dinner, we were planning a trip.<span className="text-ember">&rdquo;</span>
              </blockquote>
              <figcaption className="mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
                Priya &amp; Tom &mdash; met March 2026, NYC
              </figcaption>
            </figure>
          </Reveal>

          <div className="mt-16 grid gap-x-10 gap-y-10 border-t border-line pt-10 md:grid-cols-3">
            {[
              { t: "The concierge just told us where to be. No back-and-forth. We showed up and it clicked.", who: "Dani & Marcus", meta: "second date booked, SF" },
              { t: "A mutual friend vouched for him before we met. That one note changed how I walked in.", who: "Lena & Chris", meta: "introduced, SF" },
              { t: "One introduction at a time felt like a relief. I actually read the profile.", who: "Ben", meta: "member, NYC" },
            ].map((q, i) => (
              <Reveal key={q.who} delay={i * 0.08}>
                <figure>
                  <span className="block h-px w-10 bg-ember/50" />
                  <blockquote className="mt-4 font-display text-xl leading-snug text-ink/90">{q.t}</blockquote>
                  <figcaption className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                    {q.who} &middot; {q.meta}
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* the differentiator */}
      <section className="bg-paper/50 py-section-lg">
        <div className="container-mc grid items-center gap-12 md:grid-cols-[1fr_0.85fr]">
          <Reveal>
            <p className="kicker mb-3">Why it works</p>
            <h2 className="font-display text-4xl font-medium leading-tight tracking-tight md:text-5xl">Friends vouch for you.</h2>
            <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted">
              Members can vouch for people they know, and when two people match, either one can ask a
              mutual friend for the inside scoop. It is the warm, human thing a great matchmaker does,
              and it is what makes the introductions feel safe and real.
            </p>
            <Link href="/apply" className="btn-primary mt-8 inline-flex px-8 py-3">
              Apply to join
            </Link>
          </Reveal>
          <Reveal delay={0.12}>
            <figure className="rounded-xl2 border border-line bg-cream p-8 shadow-card ring-1 ring-claret/10">
              <span className="font-display text-4xl leading-none text-claret/40">&ldquo;</span>
              <blockquote className="mt-2 font-display text-2xl font-medium leading-snug text-ink">
                A mutual friend vouched for him before we met. That one note changed how I walked in.
              </blockquote>
              <figcaption className="mt-6 flex items-baseline justify-between border-t border-line pt-4 text-sm">
                <span className="font-display text-base text-ink">Lena &amp; Chris</span>
                <span className="text-muted">introduced, SF</span>
              </figcaption>
            </figure>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
