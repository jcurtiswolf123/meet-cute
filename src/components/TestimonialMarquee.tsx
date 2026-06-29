"use client";

import React from "react";

// Adapted from a 21st.dev marquee pattern: infinite horizontal scroll with
// edge fades, restyled to the Meet Cute brand (cream/claret, Fraunces).
type Quote = { text: string; names: string; meta: string };

const ROW_A: Quote[] = [
  { text: "We were both done with the apps. Three weeks after our first dinner, we were planning a trip.", names: "Priya & Tom", meta: "met March 2026, NYC" },
  { text: "The concierge just told us where to be. No back-and-forth. We showed up and it clicked.", names: "Dani & Marcus", meta: "second date booked, SF" },
  { text: "A mutual friend vouched for him before we met. That one note changed how I walked in.", names: "Lena & Chris", meta: "introduced, SF" },
];

const ROW_B: Quote[] = [
  { text: "I trusted it because a real person picked him, not an algorithm guessing.", names: "Sofia", meta: "member, NYC" },
  { text: "One introduction at a time felt like a relief. I actually read the profile.", names: "Ben", meta: "member, NYC" },
  { text: "The dinner was the best room I'd been in all year. I joined the roster that night.", names: "Elena", meta: "ambassador, SF" },
];

function QuoteCard({ q }: { q: Quote }) {
  return (
    <figure className="mx-3 w-80 shrink-0 rounded-xl2 border border-line bg-panel p-6 shadow-card transition-transform duration-200 ease-soft hover:-translate-y-1">
      <span className="font-display text-3xl leading-none text-claret/40">&ldquo;</span>
      <blockquote className="mt-1 text-[15px] leading-relaxed text-ink/90">{q.text}</blockquote>
      <figcaption className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
        <span className="font-display text-base">{q.names}</span>
        <span className="text-xs text-muted">{q.meta}</span>
      </figcaption>
    </figure>
  );
}

function Row({ data, reverse, speed, dark = false }: { data: Quote[]; reverse?: boolean; speed: number; dark?: boolean }) {
  const doubled = [...data, ...data];
  const bgFrom = dark ? "from-espresso" : "from-cream";
  const bgGradient = dark ? "bg-gradient-to-r from-espresso to-transparent" : "bg-gradient-to-r from-cream to-transparent";
  const bgGradientReverse = dark ? "bg-gradient-to-l from-espresso to-transparent" : "bg-gradient-to-l from-cream to-transparent";

  return (
    <div className="relative w-full overflow-hidden">
      <div className={`pointer-events-none absolute left-0 top-0 z-10 h-full w-24 ${bgGradient}`} />
      <div
        className="flex min-w-[200%] py-3 [animation-play-state:running] hover:[animation-play-state:paused] focus-within:[animation-play-state:paused] motion-reduce:!animate-none"
        style={{ animation: `mc-marquee ${speed}s linear infinite`, animationDirection: reverse ? "reverse" : "normal" }}
      >
        {doubled.map((q, i) => (
          <QuoteCard key={i} q={q} />
        ))}
      </div>
      <div className={`pointer-events-none absolute right-0 top-0 z-10 h-full w-24 ${bgGradientReverse}`} />
    </div>
  );
}

export function TestimonialMarquee({ dark = false }: { dark?: boolean }) {
  return (
    <>
      <style>{`@keyframes mc-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
      <div className="flex flex-col gap-2">
        <Row data={ROW_A} speed={42} dark={dark} />
        <Row data={ROW_B} reverse speed={48} dark={dark} />
      </div>
    </>
  );
}
