import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { conversationHealth, toneClass, relativeAge } from "@/lib/conversation-health";
import { messageGroup, resendIntro, closeIntroduction, askForFeedback } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";

export const dynamic = "force-dynamic";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

// Full transcript of one introduction, plus an operator "jump in" box. The
// transcript is the IntroMessage log: invites, Y/N replies, the bot's group
// opener, group messages logged via the Conversations webhook, and any operator
// messages. This is the "monitor + step in" surface from the call notes.
export default async function ConversationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      personA: { select: { name: true, phone: true } },
      personB: { select: { name: true, phone: true } },
      introMessages: { orderBy: { createdAt: "asc" } },
      notes: {
        where: { kind: "feedback" },
        orderBy: { createdAt: "desc" },
        include: { subject: { select: { name: true } } },
      },
    },
  });
  if (!match) notFound();

  const isConnected = match.stage === "connected";
  const isPending = match.stage === "invited" || match.stage === "mutual_yes";

  const lastMessageAt = match.introMessages.at(-1)?.createdAt ?? null;
  const health = conversationHealth({
    stage: match.stage,
    aDecision: match.aDecision,
    bDecision: match.bDecision,
    aName: match.personA.name,
    bName: match.personB.name,
    notifiedAt: match.notifiedAAt ?? match.notifiedBAt ?? null,
    connectedAt: match.connectedAt,
    lastMessageAt,
  });

  const decisionLabel = (d: string) => (d === "yes" ? "opted in (Y)" : d === "pass" ? "passed (N)" : "no reply yet");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/studio/conversations" className="text-sm text-claret underline underline-offset-2">
          &larr; All conversations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-medium">
            {firstName(match.personA.name)} + {firstName(match.personB.name)}
          </h1>
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClass(health.tone)}`}>
            {health.label}
          </span>
        </div>
      </div>

      {/* opt-in state */}
      <div className="card grid grid-cols-2 gap-4 p-4 text-sm">
        <div>
          <p className="label">{firstName(match.personA.name)}</p>
          <p className="mt-0.5 text-ink">{decisionLabel(match.aDecision)}</p>
        </div>
        <div>
          <p className="label">{firstName(match.personB.name)}</p>
          <p className="mt-0.5 text-ink">{decisionLabel(match.bDecision)}</p>
        </div>
        <div className="col-span-2 border-t border-line pt-3 text-xs text-muted">
          {match.conversationSid
            ? "Live 3-way group thread is open. Your messages post into the group."
            : "No group thread (a matchmaker cell was missing or group MMS was unavailable). Your messages text both people directly."}
        </div>
      </div>

      {/* transcript */}
      <div>
        <h2 className="font-display text-lg font-medium">Transcript</h2>
        {match.introMessages.length === 0 ? (
          <div className="card mt-3 p-6 text-center text-sm text-muted">No messages logged yet.</div>
        ) : (
          <ol className="mt-3 space-y-2">
            {match.introMessages.map((msg) => {
              const inbound = msg.direction === "in";
              return (
                <li
                  key={msg.id}
                  className={`rounded-xl border p-3 text-sm ${
                    inbound ? "border-line bg-panel" : "border-sage/25 bg-sage/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted">
                      {msg.author}
                      <span className="ml-1 lowercase text-muted/70">· {msg.kind}</span>
                    </span>
                    <span className="text-[11px] text-muted/70">
                      {msg.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-1 leading-relaxed text-ink/90">{msg.body}</p>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* post-connection feedback the members texted back */}
      {match.notes.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-medium">Feedback</h2>
          <ul className="mt-3 space-y-2">
            {match.notes.map((n) => (
              <li key={n.id} className="rounded-xl border border-champagne/40 bg-champagne/10 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted">
                    {firstName(n.subject.name)}
                  </span>
                  <span className="text-[11px] text-muted/70" title={n.createdAt.toLocaleString()}>
                    {relativeAge(n.createdAt)}
                  </span>
                </div>
                <p className="mt-1 leading-relaxed text-ink/90">{n.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* operator quick actions, scoped to the intro's stage */}
      <div className="flex flex-wrap items-center gap-3">
        {isConnected && (
          <form action={askForFeedback}>
            <input type="hidden" name="matchId" value={match.id} />
            <SubmitButton className="btn-ghost text-sm" pendingText="Texting...">
              Ask how it went
            </SubmitButton>
          </form>
        )}
        {isPending && (
          <>
            <form action={resendIntro}>
              <input type="hidden" name="matchId" value={match.id} />
              <SubmitButton className="btn-ghost text-sm" pendingText="Resending...">
                Resend invite
              </SubmitButton>
            </form>
            <form action={closeIntroduction}>
              <input type="hidden" name="matchId" value={match.id} />
              <SubmitButton className="btn-ghost text-sm" pendingText="Closing...">
                Close intro
              </SubmitButton>
            </form>
          </>
        )}
      </div>

      {/* jump in */}
      <form action={messageGroup} className="card space-y-3 p-4">
        <input type="hidden" name="matchId" value={match.id} />
        <label className="block">
          <span className="label">Jump in</span>
          <textarea
            name="message"
            required
            rows={3}
            maxLength={480}
            placeholder={
              match.conversationSid
                ? "Send a message into the group thread..."
                : "Send a message to both people..."
            }
            className="field mt-1.5"
          />
        </label>
        <SubmitButton className="btn-primary" pendingText="Sending...">
          Send
        </SubmitButton>
      </form>
    </div>
  );
}
