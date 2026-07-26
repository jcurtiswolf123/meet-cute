import Link from "next/link";
import { requireMemberPage } from "@/lib/page-auth";
import { setMatchOptIn } from "@/lib/actions";
import { connectedPersonIds } from "@/lib/social";
import { SubmitButton } from "@/components/forms";

export const dynamic = "force-dynamic";

// Member home. The matchmaker sends each introduction privately by email, and
// optional SMS is supplemental for members who separately consented to it.
export default async function Home() {
  const me = await requireMemberPage();
  const connections = await connectedPersonIds(me.id);

  if (!me.openToMatch) {
    return (
      <div className="mx-auto max-w-xl animate-fadeup px-4 py-16 text-center">
        <div className="font-display text-6xl font-light text-claret/20">&#9829;</div>
        <h1 className="mt-8 font-display text-4xl font-medium">Ready to meet someone?</h1>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted">
          Opt in and your matchmaker starts looking for the right introduction for you. If they find
          one, Meet Cute will email you a private introduction. You can say yes or pass privately,
          and a mutual yes connects you both by email. No swiping, no feed.
        </p>
        <form action={setMatchOptIn} className="mt-8">
          <input type="hidden" name="on" value="1" />
          <SubmitButton className="btn-primary px-8 py-3 text-base" pendingText="Opting in...">
            Opt in to get matched
          </SubmitButton>
        </form>
        <p className="mt-4 text-sm text-muted">
          First,{" "}
          <Link href="/app/profile" className="text-claret underline">sharpen your profile</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <div className="font-display text-6xl font-light text-claret/20">&#9829;</div>
      <h1 className="mt-8 font-display text-4xl font-medium">You are on the list.</h1>
      <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted">
        Your matchmaker is looking for your next introduction. When they find a fit, Meet Cute will
        email you a private introduction. You can decide privately from the email or profile page. A
        good introduction is worth the wait.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm">
        <Link href="/app/connections" className="btn-ghost">
          Your connections{connections.length ? ` (${connections.length})` : ""}
        </Link>
        <Link href="/app/profile" className="btn-ghost">Edit your profile</Link>
      </div>

      <form action={setMatchOptIn} className="mt-8">
        <input type="hidden" name="on" value="0" />
        <SubmitButton className="btn-ghost text-sm" pendingText="Pausing...">
          Pause matching for now
        </SubmitButton>
      </form>
    </div>
  );
}
