import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/ui";
import { SiteFooter } from "@/components/SiteFooter";
import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import { requestMagicLink } from "@/lib/actions";
import { magicLinkErrorMessage } from "@/lib/magic-link-status";
import { maxBirthdateForAge } from "@/lib/age";
import { SubmitButton } from "@/components/forms";
import { StepShell, StepError } from "./StepShell";
import { CityStep, GenderStep } from "./ChoiceStep";
import { PhotoStep } from "./PhotoStep";
import { ExtrasStep } from "./ExtrasStep";
import { saveApplicationStep } from "@/lib/actions";
import { STEPS, currentStep, isStepId, nameWasGiven, splitName, stepIndex } from "@/lib/application-steps";
import { nominationByToken, nominationCounts } from "@/lib/nominations";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apply" };

export default async function Apply({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; from?: string; ref?: string; missing?: string; email?: string; step?: string; first?: string; last?: string }>;
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
    // Arriving from a nomination: somebody put them forward, and if that person
    // wrote a couple of sentences those are already one of the two
    // recommendations. Said here, before anything is asked of them, because it
    // is the reason to keep going.
    const nomination = sp.ref ? await nominationByToken(sp.ref) : null;
    const nominatorFirst = (nomination?.nominatorName ?? "").split(" ")[0];
    return (
      <>
      <main id="main-content" className="container-mc min-h-screen py-12">
        <Logo />
        <div className="mt-10 max-w-xl">
          <p className="label mb-3">Application</p>
          <h1 className="font-display text-4xl font-medium tracking-tight">
            {invited
              ? `Welcome, ${invited.name.split(" ")[0]}.`
              : nomination
                ? `${nominatorFirst} put you forward.`
                : "Start your application."}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {invited
              ? `You vouched for ${invited.applicant.name.split(" ")[0]}, so they already count as one of the two recommendations you need. Confirm your email and we will send a one-time link to begin.`
              : nomination
                ? `${nominationCounts(nomination.note) ? `What ${nominatorFirst} wrote counts as one of the two recommendations you need, so you will only have to ask one friend.` : `Getting in takes two friends who will say something about you. That is the whole review.`} Confirm your email and we will send a one-time link to begin.`
                : "Enter your email and we will send a one-time link to begin. A real person reads every application, and you will hear back either way."}
          </p>
          {nomination?.note && nominationCounts(nomination.note) && (
            <blockquote className="mt-6 border-l-2 border-claret pl-4 font-display text-lg italic leading-relaxed text-ink">
              &ldquo;{nomination.note}&rdquo;
            </blockquote>
          )}

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
              // Prefilled by a recommender's token, a nomination, or the
              // unused-link follow-up, each of which carries an address
              // somebody already gave us. Prefilling an email grants nothing:
              // the link that actually signs anyone in is still emailed to it.
              defaultValue={invited?.email ?? nomination?.email ?? sp.email ?? ""}
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

  // Applying is not the last time somebody wants to change their application.
  // It used to be treated as such: once appliedAt landed, /apply bounced here
  // forever, and the "Edit your application" link on the page it bounced to
  // pointed straight back at /apply. An applicant who noticed a wrong city, a
  // typo in a friend's address or a photo they hated had no way in at all,
  // because the profile editor is members-only and they are not a member until
  // two friends write back. Naming a step is the way back in, and every step
  // still saves on its own.
  const editing = !!me.appliedAt;
  if (editing && !isStepId(sp.step)) redirect("/apply/thanks");

  // Signed in. Which step they are on is derived from the row, so returning on
  // another device, or from the email we send a day later, lands them exactly
  // where they stopped.
  // 18+ gate computed at render so the max never goes stale, and from calendar
  // parts rather than toISOString, which shifts the cutoff a day west of
  // Greenwich.
  const maxBirthdate = maxBirthdateForAge(18);
  const photos = await prisma.photo.findMany({
    where: { personId: me.id },
    orderBy: { order: "asc" },
    select: { id: true, url: true, status: true },
  });
  const approved = photos.filter((photo) => photo.status === "approved").length;
  // Not "have they got an applicationStep": that was right for anybody who
  // started after the form became a sequence of steps and wrong for the 25 who
  // started before it, 6 of whom had already typed a real name and came back to
  // an empty field. Ask whether the name on the row is one we invented.
  const nameGiven = nameWasGiven({ name: me.name, email: me.email });
  const row = {
    name: me.name,
    city: me.city,
    gender: me.gender,
    birthdate: me.birthdate,
    agreedTosAt: me.agreedTosAt,
    basicsAt: me.basicsAt,
    applicationStep: me.applicationStep,
  };
  const step = isStepId(sp.step) ? sp.step : currentStep(row, approved);
  const definition = STEPS[stepIndex(step)];

  const MESSAGES: Record<string, [string, string]> = {
    first: ["first", "Enter your first name."],
    last: ["last", "Enter your last name. It stays private until you and a match have both said yes."],
    city: ["city", "Pick a city."],
    gender: ["gender", "Pick one so we can match you."],
    birthdate: ["birthdate", "Enter your date of birth."],
    age: ["birthdate", "You must be 18 or older to join Mutuals."],
    photos: ["photos", "Add at least one photo to continue."],
    phone: ["phone", "That does not look like a valid mobile number. Use a 10-digit number."],
    agree: ["agree", "Please accept the Terms and Privacy Policy to continue."],
  };
  const errors = Object.fromEntries(
    (sp.missing ?? "").split(",").map((code) => MESSAGES[code]).filter(Boolean) as [string, string][],
  );

  // Everything after the first space is the surname. Destructuring a plain
  // split on every space dropped the last word of any three-part name each
  // time this page redrew, which now also means dropping a required field.
  //
  // A rejected step echoes what was typed, because it cannot be stored: half a
  // name is not a name, and the row's seeded value (the email local part) has
  // to stay distinguishable from something a person actually wrote.
  const stored = nameGiven ? splitName(me.name) : { first: "", last: "" };
  const first = sp.first ?? stored.first;
  const last = sp.last ?? stored.last;

  return (
    <>
      <main id="main-content" className="container-mc min-h-screen py-12">
        <Logo />
        <div className="mt-10">
          <StepShell step={step} title={definition.title(row)} sub={definition.sub} editing={editing}>
            {step === "name" && (
              <form action={saveApplicationStep} className="space-y-5" noValidate>
                <input type="hidden" name="step" value="name" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="first">First name</label>
                    <input
                      id="first"
                      name="first"
                      className="field mt-1.5"
                      defaultValue={first}
                      autoFocus
                      autoComplete="given-name"
                      aria-invalid={errors.first ? true : undefined}
                    />
                    <StepError message={errors.first} />
                  </div>
                  <div>
                    <label className="label" htmlFor="last">Last name</label>
                    <input
                      id="last"
                      name="last"
                      className="field mt-1.5"
                      defaultValue={last}
                      autoComplete="family-name"
                      aria-invalid={errors.last ? true : undefined}
                    />
                    <StepError message={errors.last} />
                  </div>
                </div>
                <SubmitButton className="btn-primary w-full py-3" pendingText="Saving...">
                  Continue
                </SubmitButton>
              </form>
            )}

            {step === "city" && <CityStep city={me.city ?? ""} secondCity={me.secondCity ?? ""} />}

            {step === "gender" && <GenderStep gender={me.gender ?? ""} error={errors.gender} />}

            {step === "birthdate" && (
              <form action={saveApplicationStep} className="space-y-5" noValidate>
                <input type="hidden" name="step" value="birthdate" />
                <div>
                  <label className="label" htmlFor="birthdate">Date of birth</label>
                  <input
                    id="birthdate"
                    name="birthdate"
                    type="date"
                    max={maxBirthdate}
                    className="field mt-1.5"
                    defaultValue={me.birthdate ? me.birthdate.toISOString().slice(0, 10) : ""}
                    aria-invalid={errors.birthdate ? true : undefined}
                  />
                  <StepError message={errors.birthdate} />
                </div>
                <SubmitButton className="btn-primary w-full py-3" pendingText="Saving...">
                  Continue
                </SubmitButton>
              </form>
            )}

            {step === "photo" && (
              <>
                <PhotoStep photos={photos} />
                <StepError message={errors.photos} />
              </>
            )}

            {step === "extras" && (
              <ExtrasStep
                defaults={{
                  email: me.email ?? "",
                  phone: me.phone ?? "",
                  instagram: me.instagram ?? "",
                  linkedin: me.linkedin ?? "",
                  lookingFor: me.lookingFor ?? "",
                  agreed: !!me.agreedTosAt,
                  smsConsent: !!me.smsConsentAt,
                }}
                errors={errors}
                editing={editing}
              />
            )}
          </StepShell>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
