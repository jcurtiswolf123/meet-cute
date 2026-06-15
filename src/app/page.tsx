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
      <header className="container-mc flex items-center justify-between py-6">
        <Logo />
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/dinners" className="text-muted hover:text-ink">Dinners</Link>
          <Link href="/coaching" className="text-muted hover:text-ink">Coaching</Link>
          <Link href="/login" className="text-muted hover:text-ink">Sign in</Link>
          <Link href="/apply" className="btn-primary">Apply</Link>
        </nav>
      </header>

      <Hero members={members} couples={couples} dinners={dinners} />

      {/* the arc */}
      <section className="border-y border-line bg-paper/50">
        <div className="container-mc grid gap-8 py-16 md:grid-cols-4">
          {[
            ["Meet", "Curated introductions, one at a time. Vouched for by people you both trust."],
            ["Date", "The concierge books a real table. No 'we should grab a drink sometime' that never happens."],
            ["Build", "Coaching for the people who met through us, and the ones who didn't."],
            ["Belong", "Monthly dinners. The room is the product."],
          ].map(([h, b], i) => (
            <Reveal key={h} delay={i * 0.08}>
              <h3 className="font-display text-xl font-medium">{h}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="py-20">
        <div className="container-mc">
          <Reveal>
            <p className="label mb-8">From the roster</p>
          </Reveal>
        </div>
        <TestimonialMarquee />
      </section>

      <section className="container-mc pb-20">
        <Reveal className="max-w-[60ch]">
          <h2 className="font-display text-3xl font-medium tracking-tight">The differentiator: people vouch for you.</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Every member can endorse the people they know. When two members match, either one can
            ask a mutual friend for the inside scoop. It is the thing a human matchmaker always does
            and no app does. It keeps the bar high and pulls the right people in.
          </p>
          <Link href="/apply" className="btn-primary mt-8 px-7 py-3">Request an invitation</Link>
        </Reveal>
      </section>

      <footer className="border-t border-line">
        <div className="container-mc flex items-center justify-between py-8 text-sm text-muted">
          <Logo subtle />
          <p>NYC + SF · {new Date().getFullYear()}</p>
        </div>
      </footer>
    </main>
  );
}
