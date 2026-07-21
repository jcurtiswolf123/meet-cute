"use client";

import Link from "next/link";
import { useActionState } from "react";
import { completeApplication, type ApplyState } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";

type Defaults = {
  first: string;
  last: string;
  email: string;
  phone: string;
  city: string;
  instagram: string;
  linkedin: string;
  lookingFor: string;
  maxBirthdate: string;
  voucherName: string;
  voucherContact: string;
  recommendation: string;
};

// The applicant's completion form. A client component so validation problems
// render inline next to the offending field and nothing they typed is lost on a
// failed submit (the server action echoes the values back through state).
export function ApplyForm({ defaults }: { defaults: Defaults }) {
  const [state, formAction] = useActionState<ApplyState, FormData>(completeApplication, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  // Prefer the just-typed value (on a re-render after an error), else the
  // server-provided default.
  const val = (k: keyof Defaults) => v[k] ?? defaults[k];

  return (
    <form className="mt-8 space-y-5" action={formAction} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" name="first" defaultValue={val("first")} error={e.first} required autoFocus />
        <Field label="Last name" name="last" defaultValue={val("last")} error={e.last} optionalHint />
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          className="field mt-1.5"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={val("email")}
          placeholder="you@email.com"
          aria-invalid={e.email ? true : undefined}
        />
        {e.email ? (
          <p className="mt-1 text-xs text-claret">{e.email}</p>
        ) : (
          <p className="mt-1 text-xs text-muted">
            How we reach you, and how you and a match are introduced by email when you both say yes.
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="phone">
            Mobile number <span className="text-muted">(optional)</span>
          </label>
          <input
            id="phone"
            className="field mt-1.5"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            defaultValue={val("phone")}
            placeholder="(555) 123-4567"
            aria-invalid={e.phone ? true : undefined}
          />
          {e.phone ? (
            <p className="mt-1 text-xs text-claret">{e.phone}</p>
          ) : (
            <p className="mt-1 text-xs text-muted">Only needed if you opt in to text introductions below.</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="city">City</label>
          <select id="city" className="field mt-1.5" name="city" defaultValue={val("city") === "SF" ? "SF" : "NYC"}>
            <option value="NYC">New York</option>
            <option value="SF">San Francisco</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="birthdate">Date of birth</label>
        <input
          id="birthdate"
          className="field mt-1.5"
          name="birthdate"
          type="date"
          max={defaults.maxBirthdate}
          defaultValue={v.birthdate ?? ""}
          aria-invalid={e.birthdate ? true : undefined}
        />
        {e.birthdate ? (
          <p className="mt-1 text-xs text-claret">{e.birthdate}</p>
        ) : (
          <p className="mt-1 text-xs text-muted">You must be 18 or older to join.</p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="instagram">Instagram</label>
          <input id="instagram" className="field mt-1.5" name="instagram" defaultValue={val("instagram")} placeholder="@yourhandle" autoComplete="off" />
          <p className="mt-1 text-xs text-muted">Recommended - it helps your matches put a face to the name.</p>
        </div>
        <div>
          <label className="label" htmlFor="linkedin">LinkedIn <span className="text-muted">(optional)</span></label>
          <input id="linkedin" className="field mt-1.5" name="linkedin" defaultValue={val("linkedin")} placeholder="handle or profile link" autoComplete="off" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="lookingFor">What you&apos;re looking for <span className="text-muted">(optional)</span></label>
        <input
          id="lookingFor"
          className="field mt-1.5"
          name="lookingFor"
          defaultValue={val("lookingFor")}
          placeholder="One line - something serious, a great first date, etc."
        />
      </div>

      {/* Community recommendation. Meet Cute is vouched-for: every applicant
          names someone already in the community who will speak for them. */}
      <fieldset className="space-y-4 rounded-xl border border-line bg-paper/40 p-4">
        <legend className="label px-1">Your recommendation</legend>
        <p className="-mt-1 text-xs text-muted">
          Meet Cute runs on trust. Name someone already in the community who can vouch for you, and
          share a line in their words. It shows on your profile and tells us more than a bio could.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="voucherName">Who vouches for you?</label>
            <input
              id="voucherName"
              className="field mt-1.5"
              name="voucherName"
              defaultValue={val("voucherName")}
              placeholder="Their full name"
              aria-invalid={e.voucherName ? true : undefined}
            />
            {e.voucherName && <p className="mt-1 text-xs text-claret">{e.voucherName}</p>}
          </div>
          <div>
            <label className="label" htmlFor="voucherContact">How do we reach them?</label>
            <input
              id="voucherContact"
              className="field mt-1.5"
              name="voucherContact"
              defaultValue={val("voucherContact")}
              placeholder="Their email or phone"
              aria-invalid={e.voucherContact ? true : undefined}
            />
            {e.voucherContact && <p className="mt-1 text-xs text-claret">{e.voucherContact}</p>}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="recommendation">What would they say about you?</label>
          <textarea
            id="recommendation"
            className="field mt-1.5 min-h-24"
            name="recommendation"
            defaultValue={val("recommendation")}
            placeholder="In their words: e.g. &ldquo;Josh is fun-loving, adventurous, and one of the best friends you will ever have.&rdquo;"
          />
        </div>
      </fieldset>

      {/* Required agreement: age + Terms + Privacy. This is the only box needed
          to join. */}
      <div>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="agree" className="mt-1" aria-invalid={e.agree ? true : undefined} />
          <span className="text-muted">
            I am 18 or older and I agree to the{" "}
            <Link href="/terms" className="text-claret underline" target="_blank">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-claret underline" target="_blank">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {e.agree && <p className="mt-1 text-xs text-claret">{e.agree}</p>}
      </div>

      {/* SEPARATE, OPTIONAL SMS opt-in. Unchecked by default and never required to
          join (CTIA / A2P 10DLC: SMS consent must not be bundled with, or a
          condition of, the service). Members who skip it are connected to matches
          by email instead. */}
      <div className="rounded-xl border border-line bg-paper/40 p-4">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="smsConsent" className="mt-1" />
          <span className="text-muted">
            <span className="font-medium text-ink">Text me my introductions (optional).</span> I agree to
            receive recurring text messages (SMS) from Meet Cute about my matchmaking introductions at
            the mobile number above. Message and data rates may apply; message frequency varies. Consent
            is not a condition of joining. Reply STOP to cancel, HELP for help.
          </span>
        </label>
        <p className="mt-2 pl-8 text-xs text-muted">
          Prefer not to? Leave this unchecked. You will still be introduced to your matches by email.
        </p>
      </div>

      <SubmitButton className="btn-primary w-full py-3" pendingText="Submitting...">
        Submit application
      </SubmitButton>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
  required,
  error,
  autoFocus,
  optionalHint,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  error?: string;
  autoFocus?: boolean;
  optionalHint?: boolean;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
        {optionalHint && <span className="text-muted"> (optional)</span>}
      </label>
      <input
        id={name}
        className="field mt-1.5"
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        autoFocus={autoFocus}
        aria-invalid={error ? true : undefined}
      />
      {error && <p className="mt-1 text-xs text-claret">{error}</p>}
    </div>
  );
}
