import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { decideInvite } from "@/lib/actions";
import { STORED_EXT } from "@/lib/uploads";
import { inviteIsExpired } from "@/lib/introductions";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Meet Cute introduction",
  robots: { index: false, follow: false }, // capability link, never indexed
};

// Token-gated invite page: the second half of the email double opt-in. Anyone
// holding the unguessable token sees the OTHER person's profile and can say
// Yes/Pass. No sign-in: the token IS the authorization, scoped to this one match.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const invite = await prisma.matchInvite.findUnique({ where: { token } });
  if (!invite) notFound();
  if (inviteIsExpired(invite.createdAt)) notFound();

  const match = await prisma.match.findUnique({
    where: { id: invite.matchId },
    include: {
      personA: { select: { id: true, name: true } },
      personB: { select: { id: true, name: true } },
    },
  });
  if (!match || !["invited", "mutual_yes"].includes(match.stage)) notFound();

  // The recipient is invite.personId; they are looking at the OTHER person.
  const iAmA = match.personAId === invite.personId;
  const myDecision = iAmA ? match.aDecision : match.bDecision;
  const otherId = iAmA ? match.personBId : match.personAId;
  const otherName = (iAmA ? match.personB.name : match.personA.name) || "your match";
  const otherFirst = otherName.split(" ")[0];

  const other = await prisma.person.findUnique({
    where: { id: otherId },
    include: {
      photos: { where: { status: "approved" }, orderBy: { order: "asc" } },
      prompts: { orderBy: { order: "asc" } },
    },
  });
  if (!other) notFound();

  // Serve the other person's approved photos through the token-gated proxy (the
  // normal /api/photos route requires a session, which this page does not have).
  const photoUrl = other.photos[0]
    ? `/api/invite/${token}/photo/${other.photos[0].id}.${STORED_EXT}`
    : null;

  const connected = match.stage === "connected";

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="font-display text-2xl font-medium text-ember">Meet Cute</p>
      <p className="mt-1 text-sm text-muted">An introduction, just for you.</p>

      <div className="mt-8 flex items-start gap-5">
        <Avatar url={photoUrl} name={otherName} size={96} />
        <div className="flex-1">
          <h1 className="font-display text-4xl font-medium">{otherFirst}</h1>
          <p className="mt-1 text-lg text-muted">
            {other.age ? `${other.age}` : ""}
            {other.age && (other.neighborhood || other.city) ? " . " : ""}
            {other.neighborhood ? `${other.neighborhood}, ` : ""}
            {other.city}
          </p>
          {other.headline && <p className="mt-2 font-display text-lg text-claret">{other.headline}</p>}
        </div>
      </div>

      {other.bio && (
        <section className="mt-6">
          <p className="label">About</p>
          <p className="mt-2 text-sm leading-relaxed">{other.bio}</p>
        </section>
      )}

      {(other.lookingFor || other.dealBreakers) && (
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {other.lookingFor && (
            <div>
              <p className="label">Looking for</p>
              <p className="mt-1 text-sm">{other.lookingFor}</p>
            </div>
          )}
          {other.dealBreakers && (
            <div>
              <p className="label">Deal-breakers</p>
              <p className="mt-1 text-sm">{other.dealBreakers}</p>
            </div>
          )}
        </section>
      )}

      {(other.recommendation || other.voucherName) && (
        <section className="mt-6 rounded-xl border border-sage/30 bg-sage/8 p-4">
          <p className="label text-sage">Recommendation</p>
          {other.recommendation && (
            <p className="mt-2 text-sm italic leading-relaxed text-ink/85">&ldquo;{other.recommendation}&rdquo;</p>
          )}
          {other.voucherName && <p className="mt-2 text-xs text-muted">Vouched for by {other.voucherName}</p>}
        </section>
      )}

      {other.prompts.length > 0 && (
        <section className="mt-6">
          <p className="label mb-3">Quick questions</p>
          <div className="space-y-4">
            {other.prompts.map((p) => (
              <div key={p.id}>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">{p.question}</p>
                <p className="mt-1.5 text-sm leading-relaxed">{p.answer}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Decision zone */}
      <section className="mt-10 border-t border-line/60 pt-6">
        {connected ? (
          <p className="text-sm leading-relaxed">
            You&rsquo;re connected. Check your inbox: {otherFirst} and you are on one email thread now. Just
            reply-all to say hello.
          </p>
        ) : myDecision === "yes" ? (
          <p className="text-sm leading-relaxed">
            You said <strong>yes</strong>. If {otherFirst} says yes too, we&rsquo;ll put you both on one email
            thread. Nothing to do for now.
          </p>
        ) : myDecision === "pass" || match.stage === "exit" ? (
          <p className="text-sm leading-relaxed text-muted">
            {myDecision === "pass"
              ? "You passed on this one. No worries, and no one is told."
              : "This introduction is closed."}
          </p>
        ) : (
          <>
            <p className="text-sm leading-relaxed">
              Want an introduction to {otherFirst}? If you both say yes, we&rsquo;ll connect you by email. If
              either passes, nothing happens and no one is told.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={decideInvite}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="decision" value="yes" />
                <button
                  type="submit"
                  className="rounded-full bg-ember px-6 py-2.5 text-sm font-medium text-cream transition hover:opacity-90"
                >
                  Yes, introduce us
                </button>
              </form>
              <form action={decideInvite}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="decision" value="pass" />
                <button
                  type="submit"
                  className="rounded-full border border-line px-6 py-2.5 text-sm font-medium text-ink transition hover:bg-ink/5"
                >
                  No thanks
                </button>
              </form>
            </div>
            <p className="mt-4 text-xs text-muted">
              You can also just reply <strong>Y</strong> or <strong>N</strong> to the email that brought you
              here.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
