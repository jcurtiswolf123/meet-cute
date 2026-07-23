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
    <>
      <SiteHeader overlay />

      <main id="main-content" className="min-h-screen">
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
              { n: "02", h: "Date", b: "When both people say yes, we help turn the introduction into a real first date." },
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

      {/* consent model */}
      <section className="py-section-lg">
        <div className="container-mc grid gap-8 md:grid-cols-[0.75fr_1fr] md:items-start">
          <Reveal>
            <p className="label text-claret">Mutual by design</p>
            <h2 className="mt-3 font-display text-4xl font-medium tracking-tight">Both people choose.</h2>
          </Reveal>
          <Reveal delay={0.08}>
            <p className="max-w-[52ch] text-lg leading-relaxed text-muted">
              Each introduction is private and one at a time. You see the person, decide for yourself,
              and contact details are shared only after both people say yes. A pass closes the
              introduction without telling the other person who declined.
            </p>
          </Reveal>
        </div>
      </section>

      {/* the differentiator */}
      <section className="bg-paper/50 py-section-lg">
        <div className="container-mc grid items-center gap-12 md:grid-cols-[1fr_0.85fr]">
          <Reveal>
            <p className="label mb-3 text-claret">Why it works</p>
            <h2 className="font-display text-4xl font-medium leading-tight tracking-tight">Friends vouch for you.</h2>
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
            <aside
              aria-label="How vouching works"
              className="rounded-xl2 border border-line bg-cream p-8 shadow-card ring-1 ring-claret/10"
            >
              <p className="label text-claret">Private by default</p>
              <h3 className="mt-3 font-display text-3xl font-medium leading-snug text-ink">Context, not pressure.</h3>
              <p className="mt-4 text-base leading-relaxed text-muted">
                A vouch is a short note from someone who knows you. It gives the matchmaker useful
                context without exposing your contacts or turning your profile into a public feed.
              </p>
              <p className="mt-6 border-t border-line pt-4 text-sm leading-relaxed text-muted">
                Mutual friends are inferred only from referrals, dinner attendance, and vouches
                already shared with Meet Cute.
              </p>
            </aside>
          </Reveal>
        </div>
      </section>

      </main>
      <SiteFooter />
    </>
  );
}
