import Link from "next/link";

// Text-forward warm hero: no photo. A confident left-aligned headline on the
// sunlit cream canvas, a soft warm ambient wash for depth, and the roster stats
// set on a hairline ledger.
export function Hero({ members, couples, dinners }: { members: number; couples: number; dinners: number }) {
  const hasStats = [members, couples, dinners].some((n) => n > 0);

  return (
    <section className="relative isolate overflow-hidden">
      {/* warm ambient wash for depth (subtle, headline-led, not a gradient hero) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(42% 55% at 78% 12%, rgba(231,155,120,0.20), transparent 60%), radial-gradient(46% 55% at 6% 92%, rgba(207,106,113,0.12), transparent 60%)",
        }}
      />

      <div className="container-mc pb-20 pt-36 md:pb-28 md:pt-44">
        <div className="max-w-4xl">
          <p className="mb-5 font-mono text-[11px] font-medium uppercase tracking-[0.24em] text-ember">
            Thoughtful matchmaking · NYC &amp; SF
          </p>
          <h1 className="font-display text-[2.9rem] font-medium leading-[1.02] tracking-tight text-ink sm:text-6xl md:text-[5.5rem]">
            <span className="block">
              We help you <span className="italic text-ember">meet</span>,
            </span>
            <span className="block">
              date, and stay together.
            </span>
          </h1>
          <p className="mt-7 max-w-[52ch] text-lg leading-relaxed text-muted">
            Matchmaking with a human touch. A real person picks your introductions and helps turn a
            mutual yes into a real first date. No swiping, no endless texting.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/apply" className="btn-primary px-7 py-3">
              Apply to join
            </Link>
            <Link href="/dinners" className="btn-ghost px-7 py-3">
              Come to a dinner
            </Link>
          </div>

          {hasStats ? (
            <div className="mt-14 flex flex-wrap gap-x-12 gap-y-5 border-t border-line pt-7 text-sm text-muted">
              {members > 0 && <Stat n={members} label="members on the roster" />}
              {couples > 0 && <Stat n={couples} label="couples introduced" />}
              {dinners > 0 && <Stat n={dinners} label="dinners hosted" />}
            </div>
          ) : (
            <p className="mt-14 border-t border-line pt-7 text-sm text-muted">
              By introduction only. Currently inviting members in <span className="text-ink">NYC</span> and{" "}
              <span className="text-ink">San Francisco</span>.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-display text-3xl tabular-nums text-ink">{n.toLocaleString()}</div>
      <div className="mt-1 text-xs">{label}</div>
    </div>
  );
}
