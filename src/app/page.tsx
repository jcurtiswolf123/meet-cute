import Link from "next/link";
import { TestimonialMarquee } from "@/components/TestimonialMarquee";
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

      {/* how it works: editorial flow with asymmetrical layout */}
      <section className="bg-paper/40 py-section-lg">
        <div className="container-mc">
          <Reveal>
            <p className="label mb-4 text-claret">How it works</p>
            <h2 className="font-display text-5xl font-medium leading-tight tracking-tight">Warm, simple, human.</h2>
          </Reveal>
          <div className="mt-16 grid gap-12 md:grid-cols-2 lg:grid-cols-4">
            {[
              { n: "01", h: "Meet", b: "A real matchmaker gets to know you and hand-picks introductions, one at a time." },
              { n: "02", h: "Date", b: "Our concierge books a real table, so the first date actually happens." },
              { n: "03", h: "Build", b: "Coaching to help things go well, for members and friends alike." },
              { n: "04", h: "Belong", b: "Easy monthly dinners where you meet good people. No pressure." },
            ].map(({ n, h, b }, i) => (
              <Reveal key={h} delay={i * 0.08}>
                <article className="flex flex-col gap-4">
                  <p className="font-display text-4xl font-light text-claret/50 leading-none">{n}</p>
                  <h3 className="font-display text-2xl font-medium text-ink">{h}</h3>
                  <p className="text-base leading-relaxed text-muted flex-1">{b}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* testimonials: no big dead gap, faster scroll */}
      <section className="py-20">
        <div className="container-mc mb-12">
          <Reveal>
            <p className="label text-claret">From the roster</p>
            <h2 className="mt-4 font-display text-5xl font-medium leading-tight tracking-tight">People who found their person.</h2>
          </Reveal>
        </div>
        <TestimonialMarquee />
      </section>

      {/* the differentiator: grid split with vouch story */}
      <section className="bg-paper/40 py-section-lg">
        <div className="container-mc grid items-center gap-16 md:grid-cols-[1fr_1.1fr]">
          <Reveal>
            <div>
              <p className="label mb-4 text-claret">Why it works</p>
              <h2 className="font-display text-5xl font-medium leading-tight tracking-tight">Friends vouch for you.</h2>
              <p className="mt-8 text-lg leading-relaxed text-muted max-w-prose">
                Members can vouch for people they know, and when two people match, either one can ask a mutual friend for the inside scoop. It is the warm, human thing a great matchmaker does, and it is what makes the introductions feel safe and real.
              </p>
              <Link href="/apply" className="btn-primary mt-10">
                Apply to join
              </Link>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <figure className="rounded-xl2 border-2 border-claret/20 bg-gradient-to-br from-cream to-blush/30 p-8 relative overflow-hidden">
              {/* Subtle decorative background */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-claret/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
              <div className="relative z-10">
                <span className="font-display text-6xl leading-none text-claret/20">&ldquo;</span>
                <blockquote className="mt-2 font-display text-2xl font-medium leading-snug text-ink">
                  A mutual friend vouched for him before we met. That one note changed how I walked in.
                </blockquote>
                <figcaption className="mt-8 flex items-baseline justify-between border-t border-claret/15 pt-6 text-sm">
                  <span className="font-display text-lg font-medium text-ink">Lena &amp; Chris</span>
                  <span className="text-xs text-muted uppercase tracking-wide">introduced, SF</span>
                </figcaption>
              </div>
            </figure>
          </Reveal>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
