"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

export function Hero({ members, couples, dinners }: { members: number; couples: number; dinners: number }) {
  const reduce = useReducedMotion();
  const v = reduce ? undefined : { variants: item };

  const rosterLine =
    members > 0
      ? `${members.toLocaleString()} members on the roster`
      : "Now inviting members in NYC + San Francisco";

  return (
    <section className="relative overflow-hidden">
      {/* Vertical masthead rail: an editorial signature, desktop only. */}
      <div className="pointer-events-none absolute left-3 top-0 hidden h-full items-center xl:flex">
        <span className="kicker [writing-mode:vertical-rl] rotate-180 text-muted/60">
          Meet Cute &mdash; est. NYC + SF &mdash; by introduction only
        </span>
      </div>

      <motion.div
        className="container-mc py-14 md:py-20"
        variants={reduce ? undefined : container}
        initial={reduce ? false : "hidden"}
        animate={reduce ? false : "show"}
      >
        <motion.p {...v} className="mb-6 font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-ember/80">
          Thoughtful matchmaking
        </motion.p>

        {/* Oversized, grid-breaking headline. This is the poster. */}
        <h1 className="max-w-[14ch] font-display text-[3.25rem] font-medium leading-[0.95] tracking-[-0.01em] sm:text-7xl lg:text-[6.5rem]">
          <motion.span {...v} className="block">
            We help you <span className="italic text-claret">meet</span>,
          </motion.span>
          <motion.span {...v} className="block">
            date, &amp; stay
          </motion.span>
          <motion.span {...v} className="block">
            together.
          </motion.span>
        </h1>

        <motion.div {...v} className="rule-ember mt-9 max-w-3xl" />

        {/* Asymmetric body row: copy + actions on the left, offset image on the right. */}
        <div className="mt-9 grid items-start gap-10 md:grid-cols-[1fr_0.82fr] md:gap-14">
          <motion.div {...v}>
            <p className="max-w-[46ch] text-lg leading-relaxed text-muted">
              Matchmaking with a human touch. A real person picks your introductions, and our
              concierge books the first date so it actually happens. No swiping, no endless texting.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/apply" className="btn-primary px-7 py-3">
                Apply to join
              </Link>
              <Link href="/dinners" className="btn-ghost px-7 py-3">
                Come to a dinner
              </Link>
            </div>
            <p className="mt-8 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
              <span className="inline-block h-px w-8 bg-ember/60" />
              {rosterLine}
            </p>
          </motion.div>

          {/* Image is taller than the text column and nudged up to overlap the rule
              on desktop: asymmetry that breaks the tidy two-up grid. */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 28, scale: 0.985 }}
            animate={reduce ? false : { opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
            className="relative md:-mt-28"
          >
            <div className="relative overflow-hidden rounded-xl2 border border-line bg-paper shadow-glow ring-1 ring-ember/15">
              <video
                className="aspect-[3/4] w-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                poster="/hero-poster.jpg"
                aria-hidden="true"
                tabIndex={-1}
              >
                <source src="/hero.mp4" type="video/mp4" />
              </video>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-espresso-deep/85 via-espresso-deep/10 to-transparent" />
              <figcaption className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                <span className="rounded-full border border-line/60 bg-espresso/80 px-3 py-1 text-xs font-medium text-ink shadow-sm backdrop-blur">
                  Maya &amp; Daniel
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/70">
                  introduced this spring
                </span>
              </figcaption>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}
