import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/ui";
import { conversationHealth, toneClass, relativeAge } from "@/lib/conversation-health";
import { stalledWhere, expiredWhere, STALLED_DAYS, EXPIRED_DAYS } from "@/lib/introductions";
import {
  bulkResendStalled,
  bulkCloseExpired,
  resendIntro,
  closeIntroduction,
  connectIntroNow,
  askForFeedback,
  setIntroFollowUp,
} from "@/lib/actions";
import { SubmitButton, ConfirmActionForm } from "@/components/forms";

// Every live introduction, and everything an operator can do to one.
//
// This was two pages. `/studio/conversations` drew health, opt-in, last message
// and the transcript link in a table; `/studio/matchmaking` drew the same
// introductions again as cards with Resend, Connect now, Close, Ask for
// feedback and Follow up. Neither was complete, so deciding what to do about a
// stalled pair meant holding both in your head. One row now carries the reading
// and the acting.
//
// Cards rather than a table: eight columns of signal plus five buttons ran off
// the right edge of a phone with no affordance, and this is a surface an
// operator uses standing up.

// The operator console shows whole names. Truncating to a first name is a
// member-facing privacy rule (somebody deciding whether to meet you should not
// be able to look you up first) and has no business here: two members can share
// a first name, and "Jess + Jessica" told the operator nothing.
function displayName(name: string) {
  return name.trim() || name;
}

function optIn(m: { aDecision: string; bDecision: string }) {
  const mark = (d: string) => (d === "yes" ? "Y" : d === "pass" ? "N" : "-");
  return `${mark(m.aDecision)} / ${mark(m.bDecision)}`;
}

export async function liveCount(): Promise<number> {
  return prisma.match.count({ where: { stage: { in: ["invited", "mutual_yes", "connected"] } } });
}

export async function LiveView({ resent, closed }: { resent?: string; closed?: string }) {
  const now = new Date();
  const [intros, stalledCount, expiredCount] = await Promise.all([
    prisma.match.findMany({
      where: { stage: { in: ["invited", "mutual_yes", "connected"] } },
      relationLoadStrategy: "join",
      include: {
        // One avatar each: the pair column named two people and drew neither of
        // them, so an operator scanning the board read strings for a job that
        // is about who these two are.
        personA: {
          select: {
            id: true,
            name: true,
            photos: {
              where: { status: { not: "rejected" } },
              orderBy: { order: "asc" },
              take: 1,
              select: { url: true },
            },
          },
        },
        personB: {
          select: {
            id: true,
            name: true,
            photos: {
              where: { status: { not: "rejected" } },
              orderBy: { order: "asc" },
              take: 1,
              select: { url: true },
            },
          },
        },
        introMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, body: true } },
        notes: {
          where: { kind: "feedback" },
          orderBy: { createdAt: "desc" },
          select: { id: true, body: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.match.count({ where: stalledWhere(now) }),
    prisma.match.count({ where: expiredWhere(now) }),
  ]);

  const rows = intros.map((m) => ({
    m,
    health: conversationHealth({
      stage: m.stage,
      aDecision: m.aDecision,
      bDecision: m.bDecision,
      aName: m.personA.name,
      bName: m.personB.name,
      notifiedAt: m.notifiedAAt ?? m.notifiedBAt ?? null,
      connectedAt: m.connectedAt,
      lastMessageAt: m.introMessages[0]?.createdAt ?? null,
    }),
    lastMessageAt: m.introMessages[0]?.createdAt ?? null,
    lastBody: m.introMessages[0]?.body ?? null,
  }));

  const needsAttention = rows.filter((r) => r.health.needsAttention).length;
  const connected = rows.filter((r) => r.m.stage === "connected").length;

  return (
    <div className="space-y-6">
      {(resent !== undefined || closed !== undefined) && (
        <div className="rounded-xl border border-ink/25 bg-studio-canvas px-4 py-3 text-sm text-ink">
          {resent !== undefined && (
            <span>
              Resent {resent} stalled {Number(resent) === 1 ? "intro" : "intros"}.{" "}
            </span>
          )}
          {closed !== undefined && (
            <span>
              Closed {closed} expired {Number(closed) === 1 ? "intro" : "intros"}.
            </span>
          )}
        </div>
      )}

      <div className="ledger">
        {[
          { label: "Active", value: rows.length },
          { label: "Needs attention", value: needsAttention },
          { label: "Connected", value: connected },
        ].map((k) => (
          <div key={k.label} className="ledger-cell">
            <div className="ledger-num">{k.value}</div>
            <div className="ledger-label">{k.label}</div>
          </div>
        ))}
      </div>

      {(stalledCount > 0 || expiredCount > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-studio-subtle px-4 py-3">
          <span className="text-xs uppercase tracking-wide text-muted">Bulk actions</span>
          {stalledCount > 0 && (
            <form action={bulkResendStalled}>
              <SubmitButton className="btn-ghost text-sm" pendingText="Resending...">
                Resend {stalledCount} stalled (no reply {STALLED_DAYS}d+)
              </SubmitButton>
            </form>
          )}
          {expiredCount > 0 && (
            <form action={bulkCloseExpired}>
              <SubmitButton className="btn-ghost text-sm" pendingText="Closing...">
                Close {expiredCount} expired (silent {EXPIRED_DAYS}d+)
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          No live introductions. Start one from{" "}
          <Link href="/studio/matchmaking" className="text-ink underline">
            Introduce
          </Link>
          .
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ m, health, lastMessageAt, lastBody }) => {
            const isConnected = m.stage === "connected";
            return (
              <li key={m.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="flex shrink-0 -space-x-2">
                      <Avatar url={m.personA.photos[0]?.url} name={m.personA.name} size={34} />
                      <Avatar url={m.personB.photos[0]?.url} name={m.personB.name} size={34} />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium text-ink">
                        <Link href={`/studio/person/${m.personA.id}`} className="hover:underline">
                          {displayName(m.personA.name)}
                        </Link>
                        <span className="text-muted">+</span>
                        <Link href={`/studio/person/${m.personB.id}`} className="hover:underline">
                          {displayName(m.personB.name)}
                        </Link>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClass(health.tone)}`}
                        >
                          {health.label}
                        </span>
                        {m.conversationSid && (
                          <span className="inline-flex items-center rounded-full border border-ink/25 bg-studio-canvas px-2 py-0.5 text-[10px] uppercase tracking-wide text-ink">
                            group
                          </span>
                        )}
                        {m.followUpAt && (
                          <span className="inline-flex items-center rounded-full border border-line bg-studio-subtle px-2.5 py-0.5 text-xs text-muted">
                            Follow up{" "}
                            {m.followUpAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        <span className="font-mono">{optIn(m)}</span> opted in
                        {lastMessageAt && <> · last activity {relativeAge(lastMessageAt, new Date())}</>}
                      </p>
                      {lastBody && (
                        <p className="mt-1 line-clamp-2 max-w-prose text-xs text-muted">{lastBody}</p>
                      )}
                      {m.rationale && (
                        <p className="mt-1 max-w-prose text-xs text-muted">{m.rationale}</p>
                      )}
                      {m.notes.length > 0 && (
                        <div className="mt-2 space-y-1 border-l-2 border-ink/25 pl-3">
                          <p className="label text-ink">Feedback</p>
                          {m.notes.map((n) => (
                            <p key={n.id} className="text-xs text-ink/80">
                              &ldquo;{n.body}&rdquo;{" "}
                              <span className="text-muted">
                                ({n.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })})
                              </span>
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/studio/conversations/${m.id}`}
                      className="whitespace-nowrap rounded-full border border-line px-3 py-1 text-xs text-ink transition hover:border-studio-line"
                    >
                      Open thread
                    </Link>
                    {!isConnected ? (
                      <>
                        <form action={resendIntro}>
                          <input type="hidden" name="matchId" value={m.id} />
                          <button className="btn-ghost text-xs">Resend</button>
                        </form>
                        {/* Connecting shares both members' contact details with
                            each other and cannot be taken back, and closing ends
                            the introduction. Both used to fire on the first
                            click, next to a Resend button. */}
                        <ConfirmActionForm
                          action={connectIntroNow}
                          confirmMessage="This shares both members' contact details with each other now, without waiting for a mutual yes."
                          triggerLabel="Connect now"
                          confirmLabel="Yes, connect them"
                          pendingText="Connecting..."
                          buttonClassName="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white"
                        >
                          <input type="hidden" name="matchId" value={m.id} />
                        </ConfirmActionForm>
                        <ConfirmActionForm
                          action={closeIntroduction}
                          confirmMessage="This closes the introduction. Neither member hears about it again."
                          triggerLabel="Close"
                          confirmLabel="Close it"
                          pendingText="Closing..."
                          buttonClassName="btn-ghost text-xs text-muted"
                        >
                          <input type="hidden" name="matchId" value={m.id} />
                        </ConfirmActionForm>
                      </>
                    ) : (
                      <>
                        <form action={askForFeedback}>
                          <input type="hidden" name="matchId" value={m.id} />
                          <button className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white">
                            Ask for feedback
                          </button>
                        </form>
                        <form action={setIntroFollowUp}>
                          <input type="hidden" name="matchId" value={m.id} />
                          <input type="hidden" name="days" value="7" />
                          <button className="btn-ghost text-xs">Follow up in 7d</button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
