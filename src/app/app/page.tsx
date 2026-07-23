import Link from "next/link";
import { requireMemberPage } from "@/lib/page-auth";
import { setMatchOptIn } from "@/lib/actions";
import { connectedPersonIds } from "@/lib/social";
import { SubmitButton } from "@/components/forms";

export const dynamic = "force-dynamic";

// Member home. Matching happens over SMS now: the matchmaker texts you an intro,
// you reply Y or N. So the in-app surface is small and calm: opt in to be
// matched, see who you have been connected to, keep your profile sharp.
export default async function Home() {
  const me = await requireMemberPage();
  const connections = await connectedPersonIds(me.id);

  if (!me.openToMatch) {
    return (
      <div className="mx-auto max-w-xl animate-fadeup px-4 py-16 text-center">
        <div className="font-display text-6xl font-light text-claret/20">&#9829;</div>
        <h1 className="mt-8 font-display text-4xl font-medium">Ready to meet someone?</h1>
        <p className="mx-auto mt-4 max-w-md text-lg leading-relaxed text-muted">
          Opt in and your matchmaker starts looking for the right introduction for you. When they find
          one, you will get a text. Reply Y and, if you both say yes, they connect you over text. No
          swiping, no feed.
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
        Your matchmaker is looking for your next introduction. When they find a fit, you will get a
        text. Reply Y to meet them. A good introduction is worth the wait.
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
