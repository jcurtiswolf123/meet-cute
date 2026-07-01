"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } },
};
const item = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

// Full-bleed cinematic hero: the introduction video fills the whole first
// viewport behind a candlelit scrim, the nav floats over it, and the headline
// resolves in with a staggered reveal. Motion is threefold: a slow Ken Burns
// push on the video (CSS), a scroll-linked parallax + fade as you leave (JS),
// and the staggered text entrance. All of it collapses to a still, legible
// frame under prefers-reduced-motion.
export function Hero({ members, couples, dinners }: { members: number; couples: number; dinners: number }) {
  const reduce = useReducedMotion();
  const v = reduce ? undefined : { variants: item };

  // Scroll parallax: the video drifts down slower than the page while the copy
  // lifts and fades, so the hand-off to the next section feels like a camera
  // move rather than a hard cut. Hooks run unconditionally; we just skip the
  // style binding when reduced motion is requested.
  const { scrollY } = useScroll();
  const videoY = useTransform(scrollY, [0, 700], [0, 140]);
  const copyY = useTransform(scrollY, [0, 500], [0, -60]);
  const copyOpacity = useTransform(scrollY, [0, 420], [1, 0]);

  const hasStats = [members, couples, dinners].some((n) => n > 0);

  return (
    <section className="relative isolate flex min-h-[100svh] items-end overflow-hidden">
      {/* full-bleed background. Mobile gets the optimized poster only (next/image
          serves AVIF/WebP, ~tens of KB) so we never push the 8.4MB video over
          cellular; desktop gets the autoplay video. The video is display:none
          under md, so browsers do not fetch it there. */}
      <motion.div
        className="absolute inset-0 -z-10"
        style={reduce ? undefined : { y: videoY }}
      >
        <Image
          src="/hero-poster.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className={`object-cover md:hidden ${reduce ? "" : "hero-kenburns"}`}
        />
        <video
          className={`hidden h-full w-full object-cover md:block ${reduce ? "" : "hero-kenburns"}`}
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          poster="/hero-poster.jpg"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/hero.mp4" type="video/mp4" />
        </video>
      </motion.div>

      {/* legibility scrims: a heavy pool at the bottom-left where the copy sits,
          fading to reveal the room top-right. Two directions so text stays
          readable without flattening the whole image. */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-espresso-deep via-espresso-deep/60 to-espresso-deep/15" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-espresso-deep/90 via-espresso-deep/35 to-transparent" />
      {/* film grain for cinematic texture */}
      <div className="film-grain pointer-events-none absolute inset-0 -z-10" />

      {/* social-proof label, floated top-right like a film still caption */}
      <div className="absolute right-6 top-24 hidden rounded-full border border-line/50 bg-espresso/60 px-3.5 py-1.5 text-xs font-medium text-ink/90 backdrop-blur md:block">
        Maya &amp; Daniel, introduced this spring
      </div>

      {/* content, anchored bottom-left */}
      <motion.div
        className="container-mc pb-16 pt-32 md:pb-24"
        style={reduce ? undefined : { y: copyY, opacity: copyOpacity }}
      >
        <motion.div
          className="max-w-3xl"
          variants={reduce ? undefined : container}
          initial={reduce ? false : "hidden"}
          animate={reduce ? false : "show"}
        >
          <motion.p {...v} className="mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-ember">
            Thoughtful matchmaking · NYC &amp; SF
          </motion.p>
          <h1 className="font-display text-[2.7rem] font-medium leading-[1.03] tracking-tight text-ink drop-shadow-[0_2px_20px_rgba(12,8,9,0.6)] sm:text-6xl md:text-[5.25rem]">
            <motion.span {...v} className="block">
              We help you <span className="italic text-claret-soft">meet</span>,
            </motion.span>
            <motion.span {...v} className="block">
              date, and stay together.
            </motion.span>
          </h1>
          <motion.p {...v} className="mt-6 max-w-[46ch] text-lg leading-relaxed text-ink/80">
            Matchmaking with a human touch. A real person picks your introductions, and our concierge
            books the first date so it actually happens. No swiping, no endless texting.
          </motion.p>
          <motion.div {...v} className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/apply" className="btn-primary px-7 py-3">
              Apply to join
            </Link>
            <Link
              href="/dinners"
              className="btn-ghost border-ink/25 bg-espresso/30 px-7 py-3 text-ink backdrop-blur hover:border-ember/60 hover:bg-espresso/50"
            >
              Come to a dinner
            </Link>
          </motion.div>
          {hasStats ? (
            <motion.div {...v} className="mt-11 flex flex-wrap gap-x-10 gap-y-4 text-sm text-ink/70">
              {members > 0 && <Stat n={members} label="members on the roster" />}
              {couples > 0 && <Stat n={couples} label="couples introduced" />}
              {dinners > 0 && <Stat n={dinners} label="dinners hosted" />}
            </motion.div>
          ) : (
            <motion.p {...v} className="mt-11 text-sm text-ink/70">
              By introduction only. Currently inviting members in <span className="text-ink">NYC</span> and{" "}
              <span className="text-ink">San Francisco</span>.
            </motion.p>
          )}
        </motion.div>
      </motion.div>
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
