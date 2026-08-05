"use client";

import Link from "next/link";
import { useState } from "react";
import { saveApplicationStep } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";
import { Checkbox } from "@/components/fields";

// The last step before the friends: the optional things nobody should be
// stopped by, and the one agreement that is not optional.
export function ExtrasStep({
  defaults,
  errors,
  editing,
}: {
  defaults: { email: string; phone: string; instagram: string; linkedin: string; lookingFor: string; agreed: boolean; smsConsent: boolean };
  errors: Record<string, string>;
  /** Already applied and back to change an answer. Their friends were named
   *  long ago, so promising them the friends page next would be a lie. */
  editing?: boolean;
}) {
  const [agree, setAgree] = useState(defaults.agreed);
  const [smsConsent, setSmsConsent] = useState(defaults.smsConsent);

  return (
    <form action={saveApplicationStep} className="space-y-5" noValidate>
      <input type="hidden" name="step" value="extras" />

      {/* The address every introduction goes to. The one-page form showed this
          and the stepper showed it nowhere, so somebody who signed in on a work
          laptop had no way to notice they were applying as their work address
          until the first introduction arrived there. Read-only: changing it is
          changing which account this is. */}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="field mt-1.5" type="email" defaultValue={defaults.email} readOnly />
        <p className="mt-1 text-xs text-muted">
          How we reach you, and how you and a match are introduced once you have both said yes.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="lookingFor">
          What you&apos;re looking for <span className="text-muted">(optional)</span>
        </label>
        <input
          id="lookingFor"
          name="lookingFor"
          className="field mt-1.5"
          defaultValue={defaults.lookingFor}
          placeholder="One line - something serious, a great first date, etc."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="instagram">Instagram</label>
          <input id="instagram" name="instagram" className="field mt-1.5" defaultValue={defaults.instagram} placeholder="@yourhandle" autoComplete="off" />
          <p className="mt-1 text-xs text-muted">Recommended. It helps your matches put a face to the name.</p>
        </div>
        <div>
          <label className="label" htmlFor="linkedin">LinkedIn <span className="text-muted">(optional)</span></label>
          <input id="linkedin" name="linkedin" className="field mt-1.5" defaultValue={defaults.linkedin} placeholder="handle or profile link" autoComplete="off" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="phone">
          Mobile number <span className="text-muted">(optional)</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className="field mt-1.5"
          defaultValue={defaults.phone}
          placeholder="(555) 123-4567"
          aria-invalid={errors.phone ? true : undefined}
        />
        {errors.phone ? (
          <p className="mt-1 text-xs text-claret">{errors.phone}</p>
        ) : (
          <p className="mt-1 text-xs text-muted">Only needed if you opt in to text introductions below.</p>
        )}
      </div>

      <Checkbox name="agree" checked={agree} onChange={setAgree} error={errors.agree}>
        I am 18 or older and I agree to the{" "}
        <Link href="/terms" className="text-claret underline" target="_blank">Terms of Service</Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-claret underline" target="_blank">Privacy Policy</Link>.
      </Checkbox>

      {/* Separate and optional, and never a condition of joining: CTIA and
          A2P 10DLC both require that text consent is not bundled. */}
      <div className="rounded-xl border border-line bg-paper/40 p-4">
        <Checkbox name="smsConsent" checked={smsConsent} onChange={setSmsConsent}>
          <span className="font-medium text-ink">Text me my introductions (optional).</span> I agree to
          receive recurring text messages (SMS) from Mutuals about my matchmaking introductions at the
          mobile number above. Message and data rates may apply; message frequency varies. Consent is
          not a condition of joining. Reply STOP to cancel, HELP for help.
        </Checkbox>
        <p className="mt-2 pl-8 text-xs text-muted">
          Prefer not to? Leave this unchecked. You will still be introduced to your matches by email.
        </p>
      </div>

      <SubmitButton className="btn-primary w-full py-3" pendingText="Saving...">
        {editing ? "Save these answers" : "Continue to your two friends"}
      </SubmitButton>
    </form>
  );
}
