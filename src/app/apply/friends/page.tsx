import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import { fastTrackFor } from "@/lib/recommendations";
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
        <div className="mt-10">
          <StepShell
            index={STEPS.length}
            back="/apply?step=extras"
            title="Now the part that gets you in."
            sub={`${me.name.split(" ")[0]}, everything about you is saved. Nothing here can undo that, and if you stop now you can pick this up from the link we send.`}
          >
            <ApplyFriendsForm
              gender={me.gender ?? ""}
              recommenders={recommenders}
              fastTrack={fastTrack ? { memberName: fastTrack.member.name } : null}
            />
          </StepShell>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
