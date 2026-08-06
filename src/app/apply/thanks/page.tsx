import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { ShareLink } from "@/components/ShareLink";
import { SubmitButton } from "@/components/forms";
import { getCurrentPerson } from "@/lib/auth";
import { nudgeRecommenders } from "@/lib/actions";
import { gateState } from "@/lib/recommendations";

export const dynamic = "force-dynamic";
export const metadata = { title: "Application received" };

function appBase(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com").replace(/\/$/, "");
}

// After applying, the wait is no longer a black box. Two friends have to write
// back, so this names them, says who has and who has not, and gives the
// applicant the one action that moves it: a nudge. The page used to say "hang
// tight", which was the right instruction when a matchmaker read the
// application by hand and is the wrong one now.
//
// Jess's ask, 2026-08-02, still holds underneath: the thing to do after
// applying is bring your friends, not wait. Since 2026-08-06 there are two ways
// to do that, and they are different asks: send somebody the application, or
// put a specific person forward yourself at /refer.
export default async function Thanks() {
  const me = await getCurrentPerson();
  if (!me) redirect("/login");
  if (me.status === "active") redirect("/app");

  const state = await gateState(me.id);
  const hasGate = state.recommendations.length > 0;

  return (
    <main id="main-content" className="container-mc flex min-h-screen flex-col items-start justify-center py-12">
      <Logo />

      {hasGate ? (
        <>
          <h1 className="mt-8 font-display text-4xl font-medium tracking-tight">
            {state.remaining <= 1 ? "One more to go." : "Now it's up to your friends."}
          </h1>
          <p className="mt-3 max-w-[52ch] text-lg text-muted">
            {state.remaining <= 1
              ? "One friend has written back. The moment the second one does, you are in."
              : "We have emailed both of them. The moment both write back, you are in - that is the whole review."}
          </p>

          <ul className="mt-8 w-full max-w-xl space-y-3">
            {state.recommendations.map((rec) => {
              const written = rec.status === "submitted";
              return (
                <li key={rec.id} className="rounded-xl border border-line bg-panel p-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="font-medium text-ink">{rec.name}</p>
                    <p className={`text-xs ${written ? "text-claret" : "text-muted"}`}>
                      {written ? "Written" : rec.remindedAt ? "Nudged" : "Emailed"}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted">{rec.email}</p>
                  {written && rec.body && (
                    <blockquote className="mt-3 border-l-2 border-claret pl-3 font-display text-base italic leading-relaxed text-ink">
                      &ldquo;{rec.body}&rdquo;
                    </blockquote>
                  )}
                </li>
              );
            })}
          </ul>

          {state.outstanding.length > 0 && (
            <form action={nudgeRecommenders} className="mt-5">
              <SubmitButton className="btn-ghost px-7 py-3" pendingText="Sending...">
                {state.outstanding.length === 1 ? "Send them a nudge" : "Send them both a nudge"}
              </SubmitButton>
              <p className="mt-2 text-xs text-muted">
                A message from you works better than one from us. Text them too.
              </p>
            </form>
          )}
        </>
      ) : (
        <>
          <h1 className="mt-8 font-display text-4xl font-medium tracking-tight">Thank you.</h1>
          <p className="mt-3 max-w-[48ch] text-lg text-muted">
            We read every application by hand, so hang tight. You will hear from us soon.
          </p>
        </>
      )}

      <p className="mt-10 max-w-[48ch] text-lg text-ink">
        In the meantime, send this link to your friends. The more mutuals, the better the matches.
      </p>
      <div className="mt-5 w-full max-w-xl">
        <ShareLink url={`${appBase()}/apply`} />
      </div>
      <p className="mt-6 max-w-[52ch] text-sm text-muted">
        Or put somebody specific forward and we will write to them ourselves, saying it came from
        you.{" "}
        <Link href="/refer" className="text-claret underline">
          Recommend someone
        </Link>
        .
      </p>
      <div className="mt-10 flex gap-3">
        {/* Naming the step is what gets an applied applicant back in. Plain
            "/apply" bounced straight back to this page, so this button did
            nothing at all from the moment somebody applied until they were a
            member, which is exactly the stretch they spend looking at it. */}
        <Link href="/apply?step=name" className="btn-ghost px-7 py-3">Edit your application</Link>
        <Link href="/dinners" className="btn-ghost px-7 py-3">See upcoming dinners</Link>
      </div>
    </main>
  );
}
