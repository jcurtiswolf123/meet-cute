import Link from "next/link";
import { Logo } from "@/components/ui";
import { getCurrentPerson } from "@/lib/auth";
import { requestMagicLink } from "@/lib/actions";
import { ApplyForm } from "./ApplyForm";

export const dynamic = "force-dynamic";

export default async function Apply() {
  const me = await getCurrentPerson();

  // Not signed in yet: collect an email and send a magic link to begin.
  if (!me) {
    return (
      <main className="container-mc min-h-screen py-12">
        <Logo />
        <div className="mx-auto mt-10 max-w-xl">
          <p className="label mb-3">Application</p>
          <h1 className="font-display text-4xl font-medium tracking-tight">Start your application.</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Enter your email and we will send a one-time link to begin. We read every application by
            hand and accept a fraction of them.
          </p>
          <form action={requestMagicLink} className="mt-8 space-y-3">
            {/* Keep the applicant in the application flow (not the generic /login
                "check your email" screen) before and after the magic link. */}
            <input type="hidden" name="after" value="/apply" />
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" required autoFocus autoComplete="email" className="field mt-1.5" placeholder="you@email.com" />
            <button className="btn-primary w-full py-3" type="submit">
              Send me a link
            </button>
            <p className="text-center text-xs text-muted">
              Already a member?{" "}
              <Link href="/login" className="text-claret underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </main>
    );
  }

  // Signed in: complete the application (name, age, city, what you want, consent).
  // Only prefill the name for a returning applicant who has actually applied; a
  // brand-new applicant's name is auto-derived from their email local part, so we
  // leave it blank rather than show them a guessed name to clear.
  const [first = "", last = ""] = me.appliedAt ? (me.name || "").split(" ") : ["", ""];
  // 18+ gate computed at render time so the max date never goes stale.
  const today = new Date();
  const maxBirthdate = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())
    .toISOString()
    .slice(0, 10);
  return (
    <main className="container-mc min-h-screen py-12">
      <Logo />
      <div className="mx-auto mt-10 max-w-xl">
        <p className="label mb-3">Application</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">The basics.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Signed in as {me.email}. This takes a minute - just a few essentials and your socials so we
          can get to know you.
        </p>

        <ApplyForm
          defaults={{
            first,
            last,
            phone: me.phone ?? "",
            city: me.city === "SF" ? "SF" : "NYC",
            instagram: me.instagram ?? "",
            linkedin: me.linkedin ?? "",
            lookingFor: me.lookingFor ?? "",
            maxBirthdate,
          }}
        />
      </div>
    </main>
  );
}
