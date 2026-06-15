import Link from "next/link";
import { Logo } from "@/components/ui";
import { TestimonialMarquee } from "@/components/TestimonialMarquee";
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

      {/* hero: left-aligned, editorial, not a centered gradient */}
      <section className="container-mc grid items-center gap-12 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
        <div className="animate-fadeup">
          <p className="label mb-5">By introduction only · NYC + SF</p>
          <h1 className="font-display text-5xl font-medium leading-[1.05] tracking-tight md:text-6xl">
            We help you <span className="italic text-claret">meet</span>, date, and stay together.
          </h1>
          <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted">
            Meet Cute is a curated matchmaking community. No swiping, no endless texting.
            A real person hand-picks introductions, and a concierge books the first date
            so it actually happens.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/apply" className="btn-primary px-7 py-3">Apply to join</Link>
            <Link href="/dinners" className="btn-ghost px-7 py-3">Come to a dinner</Link>
          </div>
          <div className="mt-10 flex gap-8 text-sm text-muted">
            <Stat n={members} label="members on the roster" />
            <Stat n={couples} label="couples, and counting" />
            <Stat n={dinners} label="dinners hosted" />
          </div>
        </div>

        <div className="animate-fadeup">
          <div className="card relative overflow-hidden p-0">
            <div className="aspect-[4/5] w-full bg-[radial-gradient(120%_80%_at_20%_0%,#f3ede3_0%,#e9dccb_60%,#dcc6ad_100%)]" />
            <div className="absolute inset-0 flex flex-col justify-end p-7">
              <p className="font-display text-2xl italic leading-snug text-ink">
                &ldquo;You&rsquo;re meeting Thursday at 7 at Via Carota.&rdquo;
              </p>
              <p className="mt-2 text-sm text-muted">
                The concierge decides and books, the way a great matchmaker would.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* the arc */}
      <section className="border-y border-line bg-paper/50">
        <div className="container-mc grid gap-8 py-16 md:grid-cols-4">
          {[
            ["Meet", "Curated introductions, one at a time. Vouched for by people you both trust."],
            ["Date", "The concierge books a real table. No 'we should grab a drink sometime' that never happens."],
            ["Build", "Coaching for the people who met through us, and the ones who didn't."],
            ["Belong", "Monthly dinners. The room is the product."],
          ].map(([h, b]) => (
            <div key={h}>
              <h3 className="font-display text-xl font-medium">{h}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-20">
        <div className="container-mc">
          <p className="label mb-8">From the roster</p>
        </div>
        <TestimonialMarquee />
      </section>

      <section className="container-mc pb-20">
        <div className="max-w-[60ch]">
          <h2 className="font-display text-3xl font-medium tracking-tight">The differentiator: people vouch for you.</h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Every member can endorse the people they know. When two members match, either one can
            ask a mutual friend for the inside scoop. It is the thing a human matchmaker always does
            and no app does. It keeps the bar high and pulls the right people in.
          </p>
          <Link href="/apply" className="btn-primary mt-8 px-7 py-3">Request an invitation</Link>
        </div>
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

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl text-ink">{n}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
