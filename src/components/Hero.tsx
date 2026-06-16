"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

export function Hero({ members, couples, dinners }: { members: number; couples: number; dinners: number }) {
  const reduce = useReducedMotion();
  const v = reduce ? undefined : { variants: item };

  return (
    <section className="hero-aurora relative isolate flex min-h-[88vh] items-center">
      {/* Optional motion video. Drops in automatically when /hero.mp4 exists;
          until then the animated aurora behind it carries the motion. */}
      <video
        className="absolute inset-0 -z-10 h-full w-full object-cover opacity-60"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>
      {/* legibility gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-espresso-deep/70 via-espresso/45 to-espresso-deep/85" />

      <div className="container-mc w-full">
        <motion.div
          className="max-w-3xl"
          variants={reduce ? undefined : container}
          initial={reduce ? false : "hidden"}
          animate={reduce ? false : "show"}
        >
          <motion.p {...v} className="mb-6 text-[0.7rem] font-medium uppercase tracking-[0.22em] text-champagne">
            By introduction only · New York &amp; San Francisco
          </motion.p>
          <h1 className="font-display text-[clamp(2.9rem,8vw,5rem)] font-normal leading-[1.03] tracking-[-0.02em] text-cream">
            <motion.span {...v} className="block">
              Introductions,
            </motion.span>
            <motion.span {...v} className="block">
              <span className="italic text-champagne-soft">quietly</span> made.
            </motion.span>
          </h1>
          <motion.p {...v} className="mt-7 max-w-[46ch] text-lg leading-relaxed text-cream/80 md:text-xl">
            Matchmaking by introduction only. We get to know you, then introduce you to one person
            worth meeting, and our concierge books the table so it actually happens.
          </motion.p>
          <motion.div {...v} className="mt-10 flex flex-wrap items-center gap-5">
            <Link
              href="/apply"
              className="rounded-full bg-claret px-8 py-3.5 text-sm font-medium text-cream transition hover:bg-claret-dark"
            >
              Request an introduction
            </Link>
            <Link
              href="/dinners"
              className="text-sm font-medium text-cream/85 underline decoration-champagne/40 underline-offset-4 hover:text-cream"
            >
              How it works
            </Link>
          </motion.div>
          <motion.div {...v} className="mt-14 flex gap-10 border-t border-cream/15 pt-7 text-cream/70">
            <Stat n={members} label="members on the roster" />
            <Stat n={couples} label="couples, and counting" />
            <Stat n={dinners} label="dinners hosted" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl text-cream">{n}</div>
      <div className="mt-0.5 text-xs">{label}</div>
    </div>
  );
}
