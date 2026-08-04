import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import { requestMagicLink } from "@/lib/actions";
import { magicLinkErrorMessage } from "@/lib/magic-link-status";
import { maxBirthdateForAge } from "@/lib/age";
import { normalizeCity } from "@/lib/cities";
import { ApplySection } from "./ApplySection";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apply" };

export default async function Apply({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; from?: string; missing?: string; email?: string }>;
}) {
  const me = await getCurrentPerson();
  const sp = await searchParams;

  // Not signed in yet: collect an email and send a magic link to begin.
  if (!me) {
    const sent = sp.sent === "1";
    const errorMessage = magicLinkErrorMessage(sp.error);
    // Arriving from the follow-up email a recommender got. They already gave us
    // a name and an address when someone named them, so asking for the address
    // again is friction we put there ourselves.
    const invited = sp.from
      ? await prisma.recommendation.findUnique({
          where: { token: sp.from },
          select: { name: true, email: true, applicant: { select: { name: true } } },
        })
      : null;
    return (
      <>
      <main id="main-content" className="container-mc min-h-screen py-12">
        <Logo />
        <div className="mt-10 max-w-xl">
          <p className="label mb-3">Application</p>
          <h1 className="font-display text-4xl font-medium tracking-tight">
            {invited ? `Welcome, ${invited.name.split(" ")[0]}.` : "Start your application."}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {invited
              ? `You vouched for ${invited.applicant.name.split(" ")[0]}, so they already count as one of the two recommendations you need. Confirm your email and we will send a one-time link to begin.`
              : "Enter your email and we will send a one-time link to begin. A real person reads every application, and you will hear back either way."}
          </p>

          {/* This page used to redirect back to itself after a request and render
              the identical empty form, so an applicant had no way to tell whether
              anything had happened. */}
          {sent && (
            <div className="card mt-8 p-6">
              <p className="text-sm">
                Check your email for a link to continue. It expires in 15 minutes and works once.
              </p>
            </div>
          )}
          {errorMessage && (
            <p role="alert" className="mt-8 text-sm text-claret">
              {errorMessage}
            </p>
          )}

          <form action={requestMagicLink} className="mt-8 space-y-3">
            {/* Keep the applicant in the application flow (not the generic /login
                "check your email" screen) before and after the magic link. */}
            <input type="hidden" name="after" value="/apply" />
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="field mt-1.5"
              placeholder="you@email.com"
              // Prefilled either by a recommender's token or by the
              // unused-link follow-up, which carries the address the person
              // gave us themselves. Prefilling an email grants nothing: the
              // link that actually signs anyone in is still emailed to it.
              defaultValue={invited?.email ?? sp.email ?? ""}
            />
            <button className="btn-primary w-full py-3" type="submit">
              Send me a link
            </button>
            <p className="text-center text-xs text-muted">
              Already a member?{" "}
              <Link href="/login" className="text-claret underline">
                Sign in
              </Link>
            </p>
            {/* The consent step lives inside the signed-in form, so link the
                public, sign-in-free view of it here for anyone (including
                carrier and registry reviewers) who cannot get past this wall. */}
            <p className="text-center text-xs text-muted">
              Want to see how we ask permission to text you first?{" "}
              <Link href="/sms-opt-in" className="text-claret underline">
                Read our SMS opt-in
              </Link>
              .
            </p>
          </form>
        </div>
      </main>
        <SiteFooter />
      </>
    );
  }

  if (me.appliedAt) redirect("/apply/thanks");

  // Signed in: complete the application (name, age, city, what you want, consent).
  // Only prefill the name for a returning applicant who has actually applied; a
  // brand-new applicant's name is auto-derived from their email local part, so we
  // leave it blank rather than show them a guessed name to clear.
  // Repopulate from the row, not from an echoed form state: the action saves
  // every valid field even on a failed submit precisely so this page can hand
  // the applicant back their own work after a native re-render.
  //
  // The condition is "have they ever submitted this form", not "did they finish
  // it". A brand-new applicant's name is auto-derived from their email local
  // part and showing them that guess to delete is worse than showing nothing;
  // but someone who submitted and was sent back for one missing field must get
  // their own name back, or they retype it every time and the error never
  // clears. gender and birthdate only exist after a real submit.
  const submittedBefore = !!(me.basicsAt || me.appliedAt || me.gender || me.birthdate);
  const [first = "", last = ""] = submittedBefore ? (me.name || "").split(" ") : ["", ""];
  // 18+ gate computed at render time so the max date never goes stale. Built
  // from calendar parts rather than toISOString(), which converts a local date
  // to UTC and so shifted the cutoff by a day west of Greenwich.
  const maxBirthdate = maxBirthdateForAge(18);
  // What the last save could not accept. Named rather than counted, so nobody
  // has to hunt for the one field that stopped them.
  const MESSAGES: Record<string, [string, string]> = {
    first: ["first", "Enter your first name."],
    email: ["email", "Enter a valid email so we can introduce you to your matches."],
    phone: ["phone", "That does not look like a valid mobile number. Use a 10-digit number."],
    birthdate: ["birthdate", "Enter your date of birth."],
    age: ["birthdate", "You must be 18 or older to join Mutuals."],
    agree: ["agree", "Please accept the Terms and Privacy Policy to continue."],
    gender: ["gender", "Tell us how you identify so we can match you."],
    photos: ["photos", "Add at least one photo. Your matchmaker and your introduction both need a face."],
  };
  const errors = Object.fromEntries(
    (sp.missing ?? "")
      .split(",")
      .map((code) => MESSAGES[code])
      .filter(Boolean) as [string, string][],
  );
  const photos = await prisma.photo.findMany({
    where: { personId: me.id },
    orderBy: { order: "asc" },
    select: { id: true, url: true, status: true },
  });
  // Prefill the friends they already named, so a returning applicant who is
  // fixing one field does not have to retype both recommenders. A friend who
  // has already written back is never re-mailed (see saveRecommenders).
  return (
    <>
    <main id="main-content" className="container-mc min-h-screen py-12">
      <Logo />
      <div className="mt-10 max-w-xl">
        <p className="label mb-3">Application</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">The basics.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {/* email is nullable on Person: an operator can create a member record
              without one, and "Signed in as ." reads as a broken sentence. */}
          {me.email ? `Signed in as ${me.email}. ` : ""}Start with you: a few essentials and a
          photo. We save it when you press the button, so you can stop here and come back. The two
          friends who vouch for you are the second half, and they are what get you in.
        </p>

        <ApplySection
          photos={photos}
          defaults={{
            first,
            last,
            email: me.email ?? "",
            phone: me.phone ?? "",
            city: normalizeCity(me.city),
            secondCity: me.secondCity ?? "",
            gender: me.gender ?? "",
            instagram: me.instagram ?? "",
            linkedin: me.linkedin ?? "",
            lookingFor: me.lookingFor ?? "",
            maxBirthdate,
            birthdate: me.birthdate ? me.birthdate.toISOString().slice(0, 10) : "",
            agreed: !!me.agreedTosAt,
            smsConsent: !!me.smsConsentAt,
          }}
          errors={errors}
        />
      </div>
    </main>
      <SiteFooter />
    </>
  );
}
