"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;
const SLOTS = ["Tue 7:00", "Wed 7:30", "Thu 8:00"];
const PICKED = 1; // index of the slot that gets tapped

// Steps: 0 match, 1 venue, 2 slots appear, 3 slot tapped, 4 confirmed
const LAST = 4;

export function LiveIntro() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(reduce ? LAST : 0);

  useEffect(() => {
    if (reduce) return;
    const delays = [1100, 1300, 1200, 1100, 3200]; // dwell per step
    const id = setTimeout(() => setStep((s) => (s >= LAST ? 0 : s + 1)), delays[step] ?? 1200);
    return () => clearTimeout(id);
  }, [step, reduce]);

  const show = (n: number) => step >= n;

  return (
    <div className="relative">
      {/* soft ambient glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-2xl"
        style={{ background: "radial-gradient(60% 60% at 30% 20%, rgba(194,90,102,0.18), transparent 70%)" }}
      />
      <div className="card overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-claret">✦</span>
            <span className="font-medium">Concierge</span>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sage" />
            live
          </span>
        </div>

        {/* thread */}
        <div className="flex min-h-[340px] flex-col gap-3 p-5">
          <AnimatePresence mode="popLayout">
            {show(0) && (
              <Bubble key="match" delay={0}>
                You matched with <span className="font-medium text-ink">Maya</span> <span className="text-claret">♥</span>
              </Bubble>
            )}
            {show(1) && (
              <Bubble key="venue" delay={0.05}>
                I&rsquo;ve got you a table at <span className="font-medium text-ink">Via Carota</span>. Pick a time:
              </Bubble>
            )}
            {show(2) && (
              <motion.div
                key="slots"
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="flex flex-wrap gap-2 pl-1"
              >
                {SLOTS.map((s, i) => {
                  const picked = step >= 3 && i === PICKED;
                  const dimmed = step >= 3 && i !== PICKED;
                  return (
                    <motion.span
                      key={s}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{
                        opacity: dimmed ? 0.35 : 1,
                        scale: picked ? 1.04 : 1,
                      }}
                      transition={{ duration: 0.35, ease: EASE, delay: step < 3 ? i * 0.09 : 0 }}
                      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                        picked
                          ? "border-claret bg-claret text-cream shadow-card"
                          : "border-line bg-paper text-ink"
                      }`}
                    >
                      {s}
                    </motion.span>
                  );
                })}
              </motion.div>
            )}
            {show(4) && (
              <Bubble key="confirm" delay={0.05} tone="confirm">
                You&rsquo;re set: <span className="font-medium">Wed 7:30</span> at Via Carota. Ask for the Meet Cute table. 🥂
              </Bubble>
            )}
          </AnimatePresence>

          {/* typing indicator between steps */}
          {!reduce && step < LAST && (
            <motion.div
              key={`typing-${step}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="ml-1 flex items-center gap-1"
              aria-hidden
            >
              {[0, 1, 2].map((d) => (
                <motion.span
                  key={d}
                  className="inline-block h-1.5 w-1.5 rounded-full bg-muted/60"
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: d * 0.15 }}
                />
              ))}
            </motion.div>
          )}
        </div>

        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          The concierge decides and books, the way a great matchmaker would.
        </div>
      </div>
    </div>
  );
}

function Bubble({
  children,
  delay = 0,
  tone = "bot",
}: {
  children: React.ReactNode;
  delay?: number;
  tone?: "bot" | "confirm";
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: EASE, delay }}
      className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-card ${
        tone === "confirm" ? "border border-claret/25 bg-claret/[0.06] text-ink" : "bg-white text-ink/90"
      }`}
    >
      {children}
    </motion.div>
  );
}
