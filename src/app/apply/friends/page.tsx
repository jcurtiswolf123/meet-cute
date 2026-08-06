import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import { fastTrackFor, gateState, requiredNewRecommenders } from "@/lib/recommendations";
import { convertNominationsFor } from "@/lib/nominations";
import { ApplyFriendsForm } from "./ApplyFriendsForm";
import { StepShell } from "../StepShell";
import { STEPS } from "@/lib/application-steps";

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

  // Anybody who put this person forward wrote about them before they ever got
  // here. Converting first is what makes the form ask for one friend instead of
  // two, and it is idempotent, so rendering this page twice credits nothing
  // twice.
  await convertNominationsFor({ id: me.id, email: me.email });

  const [fastTrack, state, recommenders] = await Promise.all([
    fastTrackFor(me.email),
    gateState(me.id),
    prisma.recommendation.findMany({
      where: { applicantId: me.id, status: "requested" },
      orderBy: { createdAt: "asc" },
      take: 2,
      select: { name: true, email: true, gender: true },
    }),
  ]);
  const already = state.qualifying;
  const needed = requiredNewRecommenders(fastTrack, already.length);

  return (
    <>
      <main id="main-content" className="container-mc min-h-screen py-12">
        <Logo />
        <div className="mt-10">
          <StepShell
            index={STEPS.length}
            back="/apply?step=extras"
            title="Now the part that gets you in."
            sub={`${me.name.split(" ")[0]}, everything about you is saved. Nothing here can undo that, and if you stop now you can pick this up from the link we send.`}
          >
            <ApplyFriendsForm
              needed={needed}
              recommenders={recommenders}
              fastTrack={fastTrack ? { memberName: fastTrack.member.name } : null}
              vouchedBy={already.map((r) => r.name)}
            />
          </StepShell>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
