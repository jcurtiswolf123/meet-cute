import Link from "next/link";
import { Logo, Avatar } from "@/components/ui";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/prisma";
import { gateState } from "@/lib/recommendations";
import { citiesLabel } from "@/lib/cities";
import { RecommendationForm } from "./RecommendationForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vouch for a friend", robots: { index: false, follow: false } };

// The page a friend lands on from the request email. No session, no account:
// the token IS the authorization, which is the only reason most of them will
// ever finish. It is single-purpose (one request), unguessable, and stops
// accepting writes the moment it is answered, so a forwarded link cannot
// overwrite what someone already wrote.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main id="main-content" className="container-mc min-h-screen py-12">
        <Logo />
        <div className="mt-10 max-w-xl">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <Shell>
      <h1 className="font-display text-4xl font-medium tracking-tight">This link is closed.</h1>
      <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-muted">{reason}</p>
      <div className="mt-8">
        <Link href="/" className="btn-ghost px-7 py-3">
          See what Mutuals is
        </Link>
      </div>
    </Shell>
  );
}

export default async function WriteRecommendation({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string; vouched?: string; short?: string; declined?: string }>;
}) {
  const { token } = await params;
  const { done, vouched, short, declined } = await searchParams;
  const tooShort =
    short === "1"
      ? "A couple of sentences, please. Or use the one-tap vouch above if you would rather not write."
      : undefined;

  const request = await prisma.recommendation.findUnique({
    where: { token },
    include: {
      applicant: { select: { id: true, name: true, city: true, secondCity: true, status: true } },
    },
  });

  if (!request) {
    return (
      <Unavailable reason="Recommendation links are single-use, so this one has either been answered already or is no longer current. If you meant to vouch for someone, ask them to send you a fresh link from their application." />
    );
  }

  const applicantFirst = (request.applicant.name || "your friend").split(" ")[0];
  const yourFirst = (request.name || "there").split(" ")[0];

  if (request.applicant.status === "exited") {
    return (
      <Unavailable reason={`${applicantFirst} is no longer applying to Mutuals, so there is nothing to write here. Thank you for being willing.`} />
    );
  }

  // They said no. Confirmed plainly and without guilt, and with no route back
  // in: a friend who declines and then gets asked again has not been given a
  // choice, only a delay.
  if (request.status === "declined" || declined === "1") {
    return (
      <Shell>
        <p className="label mb-3">No problem</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">Thank you for saying so.</h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-muted">
          We will not ask you about {applicantFirst} again, and you will not hear from us about this
          any further. They are not told who declined.
        </p>
      </Shell>
    );
  }

  // A tap is an answer, not the end of the conversation: it counts toward the
  // gate, and the page immediately asks for the words, which is when most of
  // them actually arrive.
  if (request.status === "endorsed" && !done) {
    return (
      <Shell>
        <p className="label mb-3">Vouched</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">
          Thank you, {yourFirst}.
        </h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-muted">
          {vouched === "1" ? "That is recorded. " : ""}
          {applicantFirst} is vouched for by you. One thing still missing: your words. They are what
          shows on {applicantFirst}&rsquo;s profile and what the person we introduce them to
          actually reads.
        </p>
        <RecommendationForm
          token={token}
          applicantFirst={applicantFirst}
          endorsed
          error={tooShort}
        />
      </Shell>
    );
  }

  if (request.status === "submitted" || done === "1") {
    const state = await gateState(request.applicantId);
    const accepted = request.applicant.status === "active";
    return (
      <Shell>
        <p className="label mb-3">Sent</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">Thank you, {yourFirst}.</h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-muted">
          {/* Only the FIRST reply is copied onto Person.recommendation, so the
              profile carries one friend's words by design. Telling the second
              friend "your words are on their profile" was untrue, and these are
              exactly the people whose goodwill the whole gate depends on. */}
          {accepted
            ? `That was the one ${applicantFirst} needed. They are in, and the two of you are why.`
            : `Your recommendation is on ${applicantFirst}'s profile. They need ${state.remaining === 1 ? "one more friend" : `${state.remaining} more friends`} to write back before they are in.`}
        </p>
        {request.body && (
          <blockquote className="mt-6 border-l-2 border-claret pl-4 font-display text-lg italic leading-relaxed text-ink">
            &ldquo;{request.body}&rdquo;
          </blockquote>
        )}
        <div className="mt-10 rounded-xl border border-line bg-panel p-5">
          <p className="text-sm leading-relaxed text-ink">
            Want introductions of your own? A matchmaker introduces you to one person at a time, by
            email, and you decide for yourself.
          </p>
          {/* Carries the token, so the application already knows their name and
              address and can tell them the member they just vouched for counts
              as one of their two. */}
          <div className="mt-4">
            <Link href={`/apply?from=${token}`} className="btn-primary px-7 py-3">
              Apply to join
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted">
            {applicantFirst} counts as one of the two recommendations you would need, so you would
            only have to ask one friend.
          </p>
        </div>
      </Shell>
    );
  }

  const place = citiesLabel(request.applicant);

  return (
    <Shell>
      <p className="label mb-3">A recommendation</p>
      <h1 className="font-display text-4xl font-medium tracking-tight">
        {applicantFirst} asked you to vouch for them.
      </h1>
      <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-muted">
        Hi {yourFirst}. {request.applicant.name} applied to Mutuals in {place}, which is curated
        matchmaking: a matchmaker introduces you to one person at a time, by email. {applicantFirst}{" "}
        is not accepted until two friends write back, so this genuinely decides it.
      </p>

      <div className="mt-8 flex items-center gap-4 border-t border-line pt-6">
        <Avatar url={null} name={request.applicant.name} size={56} />
        <div>
          <p className="font-display text-xl">{request.applicant.name}</p>
          <p className="text-sm text-muted">Applying in {place}</p>
        </div>
      </div>

      <RecommendationForm token={token} applicantFirst={applicantFirst} error={tooShort} />
    </Shell>
  );
}
