import Link from "next/link";
import { Hero } from "@/components/Hero";
import { Reveal } from "@/components/motion";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const steps = [
  {
    number: "01",
    title: "Tell us who you are.",
    body: "Fill out a short application. A real matchmaker reads every one and takes the time to get to know you.",
  },
  {
    number: "02",
    title: "Meet one person.",
    body: "Introductions arrive one at a time, with enough context to make a real decision.",
  },
  {
    number: "03",
    title: "Decide for yourself.",
    body: "You each say yes or no on your own. Nobody finds out who passed.",
  },
  {
    number: "04",
    title: "Take it offline.",
    body: "After a mutual yes, we share contact details and help turn the introduction into a date.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader overlay light />
      <main id="main-content">
        <Hero />

        <section className="border-b border-line">
          <div className="container-mc grid gap-12 py-20 md:grid-cols-12 md:items-end md:py-section-lg">
            <Reveal className="md:col-span-3">
              <p className="public-label text-muted">The idea</p>
            </Reveal>
            <Reveal className="md:col-span-8 md:col-start-5" delay={0.08}>
              <p className="font-display text-4xl leading-[1.08] tracking-[-0.025em] text-ink sm:text-5xl lg:text-6xl">
                One introduction. Two answers, kept between you and us. Contact details only after
                you both say yes.
              </p>
            </Reveal>
          </div>
        </section>

        <section id="how-it-works" className="border-b border-line py-20 md:py-section-lg">
          <div className="container-mc grid gap-12 lg:grid-cols-12 lg:gap-16">
            <Reveal className="lg:col-span-4">
              <p className="public-label text-muted">How it works</p>
              <h2 className="mt-5 max-w-[9ch] font-display text-5xl leading-[0.98] tracking-[-0.03em] sm:text-6xl">
                Less browsing. Better context.
              </h2>
            </Reveal>

            <div className="lg:col-span-7 lg:col-start-6">
              {steps.map((step, index) => (
                <Reveal key={step.number} delay={index * 0.05}>
                  <article className="grid gap-5 border-t border-line py-8 sm:grid-cols-[4rem_1fr] sm:py-10">
                    <p className="public-label text-muted">{step.number}</p>
                    <div>
                      <h3 className="text-xl font-medium tracking-[-0.02em] text-ink sm:text-2xl">
                        {step.title}
                      </h3>
                      <p className="mt-3 max-w-[48ch] text-base leading-7 text-muted">
                        {step.body}
                      </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="border-b border-line py-20 md:py-section-lg">
          <div className="container-mc grid gap-16 md:grid-cols-12 md:items-start">
            <Reveal className="md:col-span-5">
              <p className="public-label text-muted">Good introductions have context</p>
              <h2 className="mt-5 max-w-[11ch] font-display text-5xl leading-[0.98] tracking-[-0.03em] sm:text-6xl">
                Your people know you.
              </h2>
            </Reveal>
            <Reveal className="md:col-span-6 md:col-start-7" delay={0.08}>
              <p className="max-w-[50ch] text-xl leading-8 text-ink">
                Members can vouch for people they know. A short note from a friend tells your
                matchmaker the part a profile never could.
              </p>
              <p className="mt-6 max-w-[50ch] leading-7 text-muted">
                Vouches stay between you and your matchmaker. They are context for us, not content
                for a feed.
              </p>
              <Link href="/apply" className="text-link mt-9">
                Apply to join
              </Link>
            </Reveal>
          </div>
        </section>

        <section className="bg-paper">
          <div className="container-mc grid gap-12 py-20 md:grid-cols-12 md:items-end md:py-section-lg">
            <Reveal className="md:col-span-7">
              <p className="public-label text-muted">Mutuals dinners</p>
              <h2 className="mt-5 max-w-[10ch] font-display text-5xl leading-[0.98] tracking-[-0.03em] sm:text-6xl">
                Start at the table.
              </h2>
            </Reveal>
            <Reveal className="md:col-span-4 md:col-start-9" delay={0.08}>
              <p className="leading-7 text-muted">
                Twelve people. One long table. Monthly dinners in New York, San Francisco and Los Angeles, with
                no pressure to pair off.
              </p>
              <Link href="/dinners" className="text-link mt-8">
                See upcoming dinners
              </Link>
            </Reveal>
          </div>
        </section>

        <section className="border-b border-line py-20 md:py-section-lg">
          <div className="container-mc grid gap-16 md:grid-cols-12 md:items-start">
            <Reveal className="md:col-span-5">
              <p className="public-label text-muted">Coaching</p>
              <h2 className="mt-5 max-w-[12ch] font-display text-5xl leading-[0.98] tracking-[-0.03em] sm:text-6xl">
                A little help, from people who do this.
              </h2>
            </Reveal>
            <Reveal className="md:col-span-6 md:col-start-7" delay={0.08}>
              <p className="max-w-[50ch] text-xl leading-8 text-ink">
                Dating coaching for members, and couples coaching for the pairs who met through us
                and the ones who found each other elsewhere.
              </p>
              <Link href="/coaching" className="text-link mt-9">
                Explore coaching
              </Link>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-line">
          <div className="container-mc grid min-h-[26rem] items-center gap-10 py-20 md:min-h-[32rem] md:grid-cols-12 md:py-section-md">
            <Reveal className="md:col-span-7">
              <h2 className="font-display text-5xl leading-[0.98] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
                Ready to meet your friend&rsquo;s friends?
              </h2>
            </Reveal>
            <Reveal className="md:col-span-4 md:col-start-9" delay={0.08}>
              <Link href="/apply" className="btn-primary w-full px-8 py-4 sm:w-auto">
                Join Mutuals
              </Link>
              <p className="mt-5 text-sm leading-6 text-muted">
                Every application is read by a person, and you will hear back either way.
              </p>
              {/* The other half of "meet your friend's friends": plenty of
                  people read this page and think of somebody else. */}
              <p className="mt-4 text-sm leading-6 text-muted">
                Not for you, but you know who it is for?{" "}
                <Link href="/refer" className="text-link">
                  Recommend them
                </Link>
                .
              </p>
            </Reveal>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
