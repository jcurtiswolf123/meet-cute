import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Checkbox } from "@/components/fields";

export const metadata = {
  // The root layout template already appends " · Mutuals".
  title: "SMS Opt-In",
  description:
    "How Mutuals collects express written consent for text message introductions, including the exact consent language shown during application.",
};

/**
 * Public, sign-in-free view of the SMS consent step.
 *
 * The live consent controls live inside the application form at /apply, which
 * sits behind a magic-link sign-in, so carriers, The Campaign Registry, and
 * mobile network reviewers cannot reach them to validate the opt-in. This page
 * reproduces that step exactly as an applicant sees it: the same mobile number
 * field, the same required age and policy agreement, and the same separate,
 * optional, unchecked SMS consent box with identical language.
 *
 * The controls here are display-only and submit nothing. Keep this page and the
 * consent block in src/app/apply/ApplyForm.tsx in sync; if the consent language
 * changes there, change it here in the same commit.
 */
export default function SmsOptIn() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" className="container-mc min-h-screen py-12 md:py-16">
        <div className="max-w-[35rem]">
        <p className="label mt-8 mb-3">Messaging</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">
          How we ask permission to text you.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Mutuals sends text messages only about your own matchmaking introductions, and only if
          you ask us to. This page shows exactly how and where we collect that permission, and what
          the messages look like. Nothing on this page submits anything.
        </p>

        <Section title="Where consent is collected">
          <p>
            Every member applies at{" "}
            <Link href="/apply" className="text-claret underline">
              hellomutuals.com/apply
            </Link>
            . The application asks for an email address first and sends a one-time sign-in link, so
            the form itself sits behind sign-in. The block below is that form&apos;s consent step,
            reproduced here so it can be reviewed without an account.
          </p>
          <p>
            Members provide their own mobile number. We never buy, rent, import, or otherwise obtain
            numbers from third parties or purchased lists.
          </p>
        </Section>

        <Section title="The consent step, exactly as an applicant sees it">
          <div className="mt-4 rounded-xl border border-line bg-panel p-5">
            <p className="label mb-4 text-muted">Preview, display only</p>

            <div className="max-w-sm">
              <label className="label" htmlFor="preview-phone">
                Mobile number <span className="text-muted">(optional)</span>
              </label>
              <input
                id="preview-phone"
                className="field mt-1.5"
                type="tel"
                placeholder="(555) 123-4567"
                disabled
                aria-describedby="preview-phone-help"
              />
              <p id="preview-phone-help" className="mt-1 text-xs text-muted">
                Only needed if you opt in to text introductions below.
              </p>
            </div>

            <div className="mt-6">
              <Checkbox disabled>
                I am 18 or older and I agree to the{" "}
                <Link href="/terms" className="text-claret underline" target="_blank">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="text-claret underline" target="_blank">
                  Privacy Policy
                </Link>
                .
              </Checkbox>
            </div>

            <div className="mt-4 rounded-xl border border-line bg-paper/40 p-4">
              <Checkbox disabled>
                  <span className="font-medium text-ink">Text me my introductions (optional).</span>{" "}
                  I agree to receive recurring text messages (SMS) from Mutuals about my
                  matchmaking introductions at the mobile number above. Message and data rates may
                  apply; message frequency varies. Consent is not a condition of joining. Reply STOP
                  to cancel, HELP for help.
              </Checkbox>
              <p className="mt-2 pl-8 text-xs text-muted">
                Prefer not to? Leave this unchecked. You will still be introduced to your matches by
                email.
              </p>
            </div>
          </div>

          <p className="mt-4">
            Both boxes start unchecked. Neither is pre-selected, and neither is checked for you at
            any point. The SMS box is a separate control from the age and policy agreement, so
            consent to texts is never bundled with joining the service.
          </p>
        </Section>

        <Section title="Opting in is optional">
          <p>
            Text consent is not a condition of applying, of being accepted, or of being introduced
            to anyone. An applicant who leaves the SMS box unchecked, or who provides no mobile
            number at all, receives the identical service with introductions delivered by email.
          </p>
        </Section>

        <Section title="What we send">
          <p>
            Messages are transactional and person to person. A human matchmaker introduces one
            member to another, and the member replies Y to accept or N to decline. When both accept,
            we connect them in a group text. We send no marketing, promotional, advertising, or
            affiliate content on this program, and we run no drip or broadcast campaigns.
          </p>
          <p className="mt-4 font-medium text-ink">Sample messages</p>
          <ul className="mt-2 space-y-3">
            <Sample>
              Mutuals (matchmaking): Hi Maya, it&apos;s Jess, your matchmaker. I think you&apos;d
              hit it off with Alex, who works in design and loves trail running. Want an
              introduction? Reply Y for yes or N to pass. Reply STOP to opt out, HELP for help.
            </Sample>
            <Sample>
              Mutuals: Good news, you both said yes. Maya, meet Alex. Pick a time this week for a
              coffee or a call and see where it goes. Reply STOP to opt out.
            </Sample>
          </ul>
        </Section>

        <Section title="Stopping messages">
          <p>
            Reply STOP to any message to cancel at once. Reply HELP or INFO for help. Message and
            data rates may apply and message frequency varies. Members can also turn texts off at
            any time from their account, and we honor an opt-out however it reaches us.
          </p>
        </Section>

        <Section title="We do not share your mobile information">
          <p>
            No mobile information, phone number, or SMS opt-in and consent is shared with third
            parties or affiliates for marketing or promotional purposes. The full statement appears
            in our{" "}
            <Link href="/privacy" className="text-claret underline">
              Privacy Policy
            </Link>{" "}
            and the messaging program terms appear in our{" "}
            <Link href="/terms" className="text-claret underline">
              Terms of Service
            </Link>
            .
          </p>
        </Section>

        <p className="mt-12 border-t border-line pt-6 text-xs text-muted">
          Mutuals is operated by Vanguard Labs LLC. Questions about this messaging program can go
          to the contact address in our Privacy Policy.
        </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-medium tracking-tight">{title}</h2>
      <div className="mt-3 space-y-4 text-base leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function Sample({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-line bg-paper/40 p-3 text-base leading-relaxed text-muted">
      {children}
    </li>
  );
}
