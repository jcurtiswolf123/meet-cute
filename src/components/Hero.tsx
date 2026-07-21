"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE } },
};

// Warm split hero: the copy sits on the sunlit cream canvas at left, and the
// introduction photo (two people laughing over coffee) rests in a soft, rounded
// frame at right with a warm glow behind it. It reads like an invitation rather
// than a cinematic bar shot. Motion is gentle: a staggered text entrance, a slow
// Ken Burns push inside the frame, and a scroll parallax that lifts the frame a
// touch as you scroll. Everything collapses to a still, legible frame under
// prefers-reduced-motion.
export function Hero({ members, couples, dinners }: { members: number; couples: number; dinners: number }) {
  const reduce = useReducedMotion();
  const v = reduce ? undefined : { variants: item };

  const { scrollY } = useScroll();
  const frameY = useTransform(scrollY, [0, 600], [0, -46]);

  const hasStats = [members, couples, dinners].some((n) => n > 0);

  return (
    <section className="relative isolate overflow-hidden">
      {/* warm ambient wash: soft terracotta + rose pools so the cream never reads
          flat behind the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(48% 60% at 82% 30%, rgba(231,155,120,0.28), transparent 62%), radial-gradient(50% 55% at 8% 85%, rgba(207,106,113,0.14), transparent 60%)",
        }}
      />

      <div className="container-mc grid items-center gap-10 pb-16 pt-32 md:grid-cols-[1.02fr_0.98fr] md:gap-14 md:pb-24 md:pt-40">
        {/* copy */}
        <motion.div
          variants={reduce ? undefined : container}
          initial={reduce ? false : "hidden"}
          animate={reduce ? false : "show"}
        >
          <motion.p
            {...v}
            className="mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-ember"
          >
            Thoughtful matchmaking · NYC &amp; SF
          </motion.p>
          <h1 className="font-display text-[2.7rem] font-medium leading-[1.05] tracking-tight text-ink sm:text-6xl md:text-[4.5rem]">
            <motion.span {...v} className="block">
              We help you <span className="italic text-ember">meet</span>,
            </motion.span>
            <motion.span {...v} className="block">
              date, and stay together.
            </motion.span>
          </h1>
          <motion.p {...v} className="mt-6 max-w-[46ch] text-lg leading-relaxed text-muted">
            Matchmaking with a human touch. A real person picks your introductions, and our concierge
            books the first date so it actually happens. No swiping, no endless texting.
          </motion.p>
          <motion.div {...v} className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/apply" className="btn-primary px-7 py-3">
              Apply to join
            </Link>
            <Link href="/dinners" className="btn-ghost px-7 py-3">
              Come to a dinner
            </Link>
          </motion.div>
          {hasStats ? (
            <motion.div {...v} className="mt-11 flex flex-wrap gap-x-10 gap-y-4 text-sm text-muted">
              {members > 0 && <Stat n={members} label="members on the roster" />}
              {couples > 0 && <Stat n={couples} label="couples introduced" />}
              {dinners > 0 && <Stat n={dinners} label="dinners hosted" />}
            </motion.div>
          ) : (
            <motion.p {...v} className="mt-11 text-sm text-muted">
              By introduction only. Currently inviting members in <span className="text-ink">NYC</span> and{" "}
              <span className="text-ink">San Francisco</span>.
            </motion.p>
          )}
        </motion.div>

        {/* photo frame */}
        <motion.div
          className="relative"
          style={reduce ? undefined : { y: frameY }}
          initial={reduce ? false : { opacity: 0, scale: 0.96, y: 24 }}
          animate={reduce ? false : { opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
        >
          {/* warm glow behind the frame */}
          <div aria-hidden className="absolute -inset-4 -z-10 rounded-[2rem] bg-ember/20 blur-2xl" />
          <figure className="relative overflow-hidden rounded-xl2 border border-line bg-panel shadow-card ring-1 ring-ember/10">
            <div className="relative aspect-[7/5] w-full overflow-hidden">
              <Image
                src="/hero-warm.jpg"
                alt="Two people laughing together over coffee in warm morning light"
                fill
                priority
                sizes="(max-width: 768px) 100vw, 50vw"
                className={`object-cover ${reduce ? "" : "hero-kenburns"}`}
              />
              {/* whisper-soft warm veil to marry the photo to the palette */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-espresso/15 via-transparent to-transparent" />
            </div>
            {/* introduction caption, like a note tucked into a photo */}
            <figcaption className="absolute bottom-3 left-3 rounded-full border border-line/70 bg-cream/85 px-3.5 py-1.5 text-xs font-medium text-ink shadow-sm backdrop-blur">
              Maya &amp; Daniel, introduced this spring
            </figcaption>
          </figure>
        </motion.div>
      </div>
    </section>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl tabular-nums text-ink">{n.toLocaleString()}</div>
      <div className="mt-0.5 text-xs">{label}</div>
    </div>
  );
}
