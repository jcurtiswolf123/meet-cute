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

  return (
    <section className="container-mc grid items-center gap-12 py-16 md:grid-cols-[1.05fr_0.95fr] md:py-24">
      <motion.div
        variants={reduce ? undefined : container}
        initial={reduce ? false : "hidden"}
        animate={reduce ? false : "show"}
      >
        <motion.p {...v} className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-claret">
          Thoughtful matchmaking · NYC &amp; SF
        </motion.p>
        <h1 className="font-display text-5xl font-medium leading-[1.05] tracking-tight md:text-6xl">
          <motion.span {...v} className="block">
            We help you <span className="italic text-claret">meet</span>,
          </motion.span>
          <motion.span {...v} className="block">
            date, and stay together.
          </motion.span>
        </h1>
        <motion.p {...v} className="mt-6 max-w-[48ch] text-lg leading-relaxed text-muted">
          Meet Cute is matchmaking with a human touch. A real person picks your introductions, and
          our concierge books the first date so it actually happens. No swiping, no endless texting.
        </motion.p>
        <motion.div {...v} className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/apply" className="btn-primary px-7 py-3">
            Apply to join
          </Link>
          <Link href="/dinners" className="btn-ghost px-7 py-3">
            Come to a dinner
          </Link>
        </motion.div>
        {[members, couples, dinners].some((n) => n > 0) && (
          <motion.div {...v} className="mt-10 flex gap-8 text-sm text-muted">
            {members > 0 && <Stat n={members} label="members on the roster" />}
            {couples > 0 && <Stat n={couples} label="couples, and counting" />}
            {dinners > 0 && <Stat n={dinners} label="dinners hosted" />}
          </motion.div>
        )}
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
        animate={reduce ? false : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
        className="relative"
      >
        <div className="relative overflow-hidden rounded-xl2 border border-line bg-paper shadow-card ring-1 ring-claret/10">
          <video
            className="aspect-[4/5] w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
          >
            <source src="/hero.mp4" type="video/mp4" />
          </video>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/20 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 rounded-full bg-cream/90 px-3 py-1 text-xs font-medium text-ink shadow-sm backdrop-blur">
            Maya &amp; Daniel, introduced this spring
          </div>
        </div>
      </motion.div>
    </section>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl text-ink">{n}</div>
      <div className="mt-0.5 text-xs">{label}</div>
    </div>
  );
}
