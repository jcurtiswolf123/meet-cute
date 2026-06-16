import Link from "next/link";
import { Logo } from "@/components/ui";
import { TestimonialMarquee } from "@/components/TestimonialMarquee";
import { Hero } from "@/components/Hero";
import { Reveal } from "@/components/motion";
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
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="container-mc flex items-center justify-between py-6">
          <Logo light />
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/dinners" className="text-cream/80 hover:text-cream">Dinners</Link>
            <Link href="/coaching" className="text-cream/80 hover:text-cream">Coaching</Link>
            <Link href="/login" className="text-cream/80 hover:text-cream">Sign in</Link>
            <Link href="/apply" className="rounded-full border border-cream/30 px-4 py-1.5 text-cream transition hover:bg-cream hover:text-espresso">Apply</Link>
          </nav>
        </div>
      </header>

      <Hero members={members} couples={couples} dinners={dinners} />

      {/* how it works: numbered steps */}
      <section className="py-section-lg">
        <div className="container-mc">
          <div className="grid gap-section-md md:grid-cols-4">
            {[
              { n: "01", h: "Meet", b: "Curated introductions, one at a time. Vouched for by people you both trust." },
              { n: "02", h: "Date", b: "The concierge books a real table. No vague promises. Actual date, actual time." },
              { n: "03", h: "Build", b: "Coaching for the people who met through us, and the ones who didn't." },
              { n: "04", h: "Belong", b: "Monthly dinners. The room is the product." },
            ].map(({ n, h, b }, i) => (
              <Reveal key={h} delay={i * 0.08}>
                <div className="flex flex-col gap-4">
                  <p className="font-display text-4xl font-light text-champagne/50">{n}</p>
                  <div>
                    <h3 className="font-display text-2xl font-medium">{h}</h3>
                    <p className="mt-3 text-base leading-relaxed text-muted">{b}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* divider */}
      <div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-champagne/20 to-transparent" />

      {/* testimonials */}
      <section className="bg-espresso py-section-lg">
        <div className="container-mc mb-section-md">
          <Reveal>
            <p className="label mb-8 text-champagne">From the roster</p>
          </Reveal>
        </div>
        <TestimonialMarquee dark />
      </section>

      {/* divider */}
      <div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-champagne/20 to-transparent" />

      {/* the differentiator */}
      <section className="py-section-lg">
        <div className="container-mc">
          <Reveal className="max-w-[60ch]">
            <h2 className="font-display text-5xl font-medium leading-tight tracking-tight">The differentiator</h2>
            <p className="mt-6 text-lg leading-relaxed text-muted">
              Every member can vouch for the people they know. When two members match, either one can
              ask a mutual friend for the inside scoop. It is the thing a human matchmaker always does
              and no app ever does. It keeps the bar high and pulls the right people in.
            </p>
            <Link href="/apply" className="btn-primary mt-8 inline-flex px-8 py-3">
              Request an invitation
            </Link>
          </Reveal>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-line bg-cream">
        <div className="container-mc flex items-center justify-between py-section-md text-sm text-muted">
          <Logo subtle />
          <div className="text-right">
            <p className="font-medium text-ink">NYC · San Francisco</p>
            <p className="mt-1">© {new Date().getFullYear()} Meet Cute</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
