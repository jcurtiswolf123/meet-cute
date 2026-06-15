"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { LiveIntro } from "./LiveIntro";

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
};

export function Hero({ members, couples, dinners }: { members: number; couples: number; dinners: number }) {
  const reduce = useReducedMotion();
  const v = reduce ? undefined : { variants: item };

  return (
    <section className="container-mc grid items-center gap-12 py-16 md:grid-cols-[1.1fr_0.9fr] md:py-24">
      <motion.div variants={reduce ? undefined : container} initial={reduce ? false : "hidden"} animate={reduce ? false : "show"}>
        <motion.p {...v} className="label mb-5">
          By introduction only · NYC + SF
        </motion.p>
        <h1 className="font-display text-5xl font-medium leading-[1.05] tracking-tight md:text-6xl">
          <motion.span {...v} className="block">
            We help you <span className="italic text-claret">meet</span>,
          </motion.span>
          <motion.span {...v} className="block">
            date, and stay together.
          </motion.span>
        </h1>
        <motion.p {...v} className="mt-6 max-w-[52ch] text-lg leading-relaxed text-muted">
          Meet Cute is a curated matchmaking community. No swiping, no endless texting. A real person
          hand-picks introductions, and a concierge books the first date so it actually happens.
        </motion.p>
        <motion.div {...v} className="mt-9 flex flex-wrap items-center gap-3">
          <Link href="/apply" className="btn-primary px-7 py-3">Apply to join</Link>
          <Link href="/dinners" className="btn-ghost px-7 py-3">Come to a dinner</Link>
        </motion.div>
        <motion.div {...v} className="mt-10 flex gap-8 text-sm text-muted">
          <Stat n={members} label="members on the roster" />
          <Stat n={couples} label="couples, and counting" />
          <Stat n={dinners} label="dinners hosted" />
        </motion.div>
      </motion.div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 24, scale: 0.98 }}
        animate={reduce ? false : { opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.25 }}
      >
        <LiveIntro />
      </motion.div>
    </section>
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
