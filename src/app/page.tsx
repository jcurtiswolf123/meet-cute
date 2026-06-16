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
      <header className="border-b border-line bg-cream/80 backdrop-blur">
        <div className="container-mc flex items-center justify-between py-5">
          <Logo />
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/dinners" className="text-muted hover:text-ink">Dinners</Link>
            <Link href="/coaching" className="text-muted hover:text-ink">Coaching</Link>
            <Link href="/login" className="text-muted hover:text-ink">Sign in</Link>
            <Link href="/apply" className="btn-primary">Apply</Link>
          </nav>
        </div>
      </header>

      <Hero members={members} couples={couples} dinners={dinners} />

      {/* how it works */}
      <section className="bg-paper/50 py-section-lg">
        <div className="container-mc">
          <Reveal>
            <p className="label mb-3 text-claret">How it works</p>
            <h2 className="font-display text-4xl font-medium tracking-tight">Warm, simple, human.</h2>
          </Reveal>
          <div className="mt-12 grid gap-section-md md:grid-cols-4">
            {[
              { n: "01", h: "Meet", b: "A real matchmaker gets to know you and hand-picks introductions, one at a time." },
              { n: "02", h: "Date", b: "Our concierge books a real table, so the first date actually happens." },
              { n: "03", h: "Build", b: "Coaching to help things go well, for members and friends alike." },
              { n: "04", h: "Belong", b: "Easy monthly dinners where you meet good people. No pressure." },
            ].map(({ n, h, b }, i) => (
              <Reveal key={h} delay={i * 0.08}>
                <div className="flex flex-col gap-3">
                  <p className="font-display text-3xl font-light text-claret/40">{n}</p>
                  <h3 className="font-display text-2xl font-medium">{h}</h3>
                  <p className="text-base leading-relaxed text-muted">{b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* testimonials */}
      <section className="py-section-lg">
        <div className="container-mc mb-10">
          <Reveal>
            <p className="label text-claret">From the roster</p>
            <h2 className="mt-3 font-display text-4xl font-medium tracking-tight">People who found their person.</h2>
          </Reveal>
        </div>
        <TestimonialMarquee />
      </section>

      {/* the differentiator */}
      <section className="bg-paper/50 py-section-lg">
        <div className="container-mc">
          <Reveal className="max-w-[60ch]">
            <p className="label mb-3 text-claret">Why it works</p>
            <h2 className="font-display text-4xl font-medium leading-tight tracking-tight">Friends vouch for you.</h2>
            <p className="mt-6 text-lg leading-relaxed text-muted">
              Members can vouch for people they know, and when two people match, either one can ask a
              mutual friend for the inside scoop. It is the warm, human thing a great matchmaker does,
              and it is what makes the introductions feel safe and real.
            </p>
            <Link href="/apply" className="btn-primary mt-8 inline-flex px-8 py-3">
              Apply to join
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
