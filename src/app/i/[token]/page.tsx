import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { decideInvite } from "@/lib/actions";
import { STORED_EXT } from "@/lib/uploads";
import { inviteIsExpired } from "@/lib/introductions";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your Mutuals introduction",
  robots: { index: false, follow: false }, // capability link, never indexed
};

// Token-gated invite page: the second half of the email double opt-in. Anyone
// holding the unguessable token sees the OTHER person's profile and can say
// Yes/Pass. No sign-in: the token IS the authorization, scoped to this one match.
// An invite link that no longer resolves is a NORMAL thing for a member to
// click: tokens rotate whenever an introduction is re-sent, expire on their own,
// and are removed once the introduction closes. Answering that with the generic
// 404 tells the member the site is broken when nothing is wrong, and it is the
// one page in the product they reach straight from their inbox with no session.
// Explain what happened and give them somewhere to go instead.
function InviteUnavailable({ reason }: { reason: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
      <p className="public-label text-muted">Mutuals</p>
      <h1 className="mt-5 font-display text-3xl font-normal leading-tight text-ink">
        This introduction link is no longer open.
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">{reason}</p>
      <p className="mt-3 text-base leading-relaxed text-muted">
        Nothing is wrong with your account, and you have not missed anything. Your
        matchmaker can always send the introduction again.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href="/app" className="btn-primary">
          Go to your account
        </a>
        <a href="/login" className="btn-ghost">
          Sign in
        </a>
      </div>
    </main>
  );
}

// What the member is told after tapping Yes or Pass. Keyed by the short code
// decideInvite puts in `?d=`. Mirrors the operator-side `?intro=` codes: the
// action never throws and never returns silently, it always comes back here
// with something to read.
const DECISION_NOTICE: Record<string, string> = {
  yes: "You said yes. We will let you know as soon as they answer.",
  pass: "Passed. Nothing happens from here, and they are not told.",
  mutual: "You both said yes. Check your inbox for the introduction.",
  connected: "You are connected. Check your inbox and say hello.",
  stale:
    "We could not record that. This introduction has already been answered or closed, so there is nothing left to decide.",
  "bad-request": "Something about that request did not come through. Try the buttons again.",
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ d?: string }>;
}) {
  const { token } = await params;
  const notice = DECISION_NOTICE[(await searchParams).d ?? ""];

  const invite = await prisma.matchInvite.findUnique({ where: { token } });
  if (!invite) {
    return (
      <InviteUnavailable reason="This link has already been replaced by a newer one, or the introduction it belonged to has since closed." />
    );
  }
  if (inviteIsExpired(invite.createdAt)) {
    return (
      <InviteUnavailable reason="Introduction links expire after a while, so they cannot be forwarded or reused later." />
    );
  }

  const match = await prisma.match.findUnique({
    where: { id: invite.matchId },
    include: {
      personA: { select: { id: true, name: true } },
      personB: { select: { id: true, name: true } },
    },
  });
  if (!match || !["invited", "mutual_yes", "connecting", "connected"].includes(match.stage)) {
    return (
      <InviteUnavailable reason="This introduction has already been closed out, so there is nothing left to decide here." />
    );
  }

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
  // All of them, not just the first: this is the page where someone decides
  // whether to meet a stranger, and one 96px avatar is not enough to decide on.
  const photoUrls = other.photos.map((p) => `/api/invite/${token}/photo/${p.id}.${STORED_EXT}`);
  const photoUrl = photoUrls[0] ?? null;

  const connected = match.stage === "connected";

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="font-display text-2xl font-medium text-ember">Mutuals</p>
      <p className="mt-1 text-sm text-muted">An introduction, just for you.</p>

      {notice && (
        <p
          role="status"
          className="mt-6 rounded-xl border border-line bg-panel px-5 py-4 text-sm leading-relaxed text-ink"
        >
          {notice}
        </p>
      )}

      {/* Photos lead. You are being asked whether you want to meet this person,
          so their face is the first thing on the page rather than a thumbnail
          beside their name. The first photo is large; the rest follow in a row
          you can scroll on a phone. Everything is served through the
          token-scoped proxy and is approved-only. */}
      {photoUrls.length > 0 ? (
        <div className="mt-8">
          {/* eslint-disable-next-line @next/next/no-img-element -- token-proxied,
              not a static asset, and next/image cannot cache a capability URL */}
          <img
            src={photoUrls[0]}
            alt={`${otherFirst}, photo 1 of ${photoUrls.length}`}
            className="aspect-[4/5] w-full max-w-sm rounded-xl border border-line object-cover"
          />
          {photoUrls.length > 1 && (
            <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
              {photoUrls.slice(1).map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt={`${otherFirst}, photo ${i + 2} of ${photoUrls.length}`}
                  className="h-32 w-[6.4rem] flex-none rounded-lg border border-line object-cover"
                />
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className={`flex items-start gap-5 ${photoUrls.length ? "mt-6" : "mt-8"}`}>
        {photoUrls.length === 0 && <Avatar url={photoUrl} name={otherName} size={96} />}
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
            You&rsquo;re connected. Check your inbox for {otherFirst}&rsquo;s contact details and say hello.
          </p>
        ) : myDecision === "yes" ? (
          <p className="text-sm leading-relaxed">
            You said <strong>yes</strong>. If {otherFirst} says yes too, we&rsquo;ll email you both the
            connection details. Nothing to do for now.
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
