import Link from "next/link";
import { Logo, Avatar } from "@/components/ui";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/prisma";
import { gateState } from "@/lib/recommendations";
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
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;

  const request = await prisma.recommendation.findUnique({
    where: { token },
    include: {
      applicant: { select: { id: true, name: true, city: true, status: true } },
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

  if (request.status === "submitted" || done === "1") {
    const state = await gateState(request.applicantId);
    const accepted = request.applicant.status === "active";
    return (
      <Shell>
        <p className="label mb-3">Sent</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">Thank you, {yourFirst}.</h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-muted">
          {accepted
            ? `That was the one ${applicantFirst} needed. They are in, and your words are on their profile.`
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
          <div className="mt-4">
            <Link href="/apply" className="btn-primary px-7 py-3">
              Apply to join
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const place = request.applicant.city === "SF" ? "San Francisco" : "New York";

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

      <RecommendationForm token={token} applicantFirst={applicantFirst} />
    </Shell>
  );
}
