import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import { fastTrackFor } from "@/lib/recommendations";
import { ApplyFriendsForm } from "./ApplyFriendsForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your two friends" };

// The second half of the application, on its own page, because the first half
// is already saved by the time anyone gets here. Someone who closes this tab
// has not lost an application: they have an application waiting on two names.
export default async function ApplyFriends() {
  const me = await getCurrentPerson();
  if (!me) redirect("/login");
  if (me.isOperator) redirect("/studio");
  // Nothing saved yet: they have skipped the half that this one builds on.
  if (!me.basicsAt) redirect("/apply");
  if (me.appliedAt) redirect("/apply/thanks");

  const [fastTrack, recommenders] = await Promise.all([
    fastTrackFor(me.email, me.gender),
    prisma.recommendation.findMany({
      where: { applicantId: me.id },
      orderBy: { createdAt: "asc" },
      take: 2,
      select: { name: true, email: true, gender: true },
    }),
  ]);

  return (
    <>
      <main id="main-content" className="container-mc min-h-screen py-12">
        <Logo />
        <div className="mt-10 max-w-xl">
          {/* Both halves named, and the first one shown as done, so the second
              reads as the short end of something rather than a new demand. */}
          <ol className="flex items-center gap-3 text-xs">
            <li className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full border border-ink bg-ink text-[11px] font-semibold text-cream">
                1
              </span>
              <span className="text-muted">You, saved</span>
            </li>
            <span className="h-px w-8 bg-line" />
            <li className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full border border-ink bg-ink text-[11px] font-semibold text-cream">
                2
              </span>
              <span className="text-ink">Your two friends</span>
            </li>
          </ol>

          <h1 className="mt-8 font-display text-4xl font-medium tracking-tight">
            Now the part that gets you in.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {me.name.split(" ")[0]}, everything about you is saved. Nothing here can undo that, and
            if you stop now you can pick this up from the link we send.
          </p>

          <ApplyFriendsForm
            gender={me.gender ?? ""}
            recommenders={recommenders}
            fastTrack={fastTrack ? { memberName: fastTrack.member.name } : null}
          />

          <p className="mt-6 text-center text-xs text-muted">
            <Link href="/apply" className="underline underline-offset-2">
              Back to your details
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
