"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { completeApplication, type ApplyState } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";

type Defaults = {
  first: string;
  last: string;
  email: string;
  phone: string;
  city: string;
  gender: string;
  instagram: string;
  linkedin: string;
  lookingFor: string;
  maxBirthdate: string;
  recommenders: { name: string; email: string; gender: string }[];
};

const GENDER_OPTIONS = [
  ["woman", "Woman"],
  ["man", "Man"],
  ["nonbinary", "Non-binary"],
] as const;

// The applicant's completion form. A client component so validation problems
// render inline next to the offending field and nothing they typed is lost on a
// failed submit (the server action echoes the values back through state).
export function ApplyForm({
  defaults,
  photoCount,
}: {
  defaults: Defaults;
  /** Live count from the uploader above, which posts outside this form. */
  photoCount: number;
}) {
  const [state, formAction] = useActionState<ApplyState, FormData>(completeApplication, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  // Prefer the just-typed value (on a re-render after an error), else the
  // server-provided default.
  const val = (k: keyof Omit<Defaults, "recommenders">) => v[k] ?? defaults[k];
  const rec = (slot: 1 | 2, field: "Name" | "Email" | "Gender") =>
    v[`rec${slot}${field}`] ?? defaults.recommenders[slot - 1]?.[field.toLowerCase() as "name" | "email" | "gender"] ?? "";

  // The uploader posts to /api/photos on its own, so the missing-photo error
  // comes back attached to this form rather than to the thing it is about. It
  // is rendered here, at the top, with a link back up to the uploader: routing
  // it into the uploader through a callback made the message depend on an
  // effect firing, and a required-field error is not allowed to be that fragile.
  const photoError = photoCount === 0 ? e.photos : undefined;

  // Every select and checkbox on this form is controlled, and has to be.
  //
  // A failed submit re-renders this component through useActionState. Text
  // inputs keep whatever is in the DOM, but an uncontrolled <select> is
  // re-applied from defaultValue and an uncontrolled checkbox comes back
  // unchecked, so a re-render silently reset the terms box, the city, and both
  // recommender genders. The applicant then fixed the one field the error
  // pointed at, submitted again, and got a fresh set of errors for fields they
  // had already filled in. React state is what survives that round trip.
  //
  // The applicant's own gender is also read below, so the rule can name the
  // actual requirement ("two men") rather than making someone work out what
  // "opposite" means and then rejecting them for guessing wrong.
  const [gender, setGender] = useState(val("gender"));
  const [city, setCity] = useState(val("city") === "SF" ? "SF" : "NYC");
  const [agree, setAgree] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [recGenders, setRecGenders] = useState<[string, string]>([rec(1, "Gender"), rec(2, "Gender")]);
  const setRecGender = (slot: 1 | 2, value: string) =>
    setRecGenders((prev) => (slot === 1 ? [value, prev[1]] : [prev[0], value]));

  const vouchRule =
    gender === "woman"
      ? "Name two men who know you well."
      : gender === "man"
        ? "Name two women who know you well."
        : gender === "nonbinary"
          ? "Name two friends who know you well."
          : "Name two friends of the opposite gender who know you well.";

  return (
    <form className="mt-8 space-y-5" action={formAction} noValidate>
      {photoError && (
        <p role="alert" className="rounded-xl border border-claret/30 bg-panel px-4 py-3 text-sm text-claret">
          {photoError}{" "}
          <a href="#photos-upload" className="underline">
            Add one above.
          </a>
        </p>
      )}
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
          readOnly
          placeholder="you@email.com"
          aria-invalid={e.email ? true : undefined}
          aria-describedby={e.email ? "email-error" : undefined}
        />
        {e.email ? (
          <p id="email-error" className="mt-1 text-xs text-claret">{e.email}</p>
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
            aria-describedby={e.phone ? "phone-error" : undefined}
          />
          {e.phone ? (
            <p id="phone-error" className="mt-1 text-xs text-claret">{e.phone}</p>
          ) : (
            <p className="mt-1 text-xs text-muted">Only needed if you opt in to text introductions below.</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="city">City</label>
          <select
            id="city"
            className="field mt-1.5"
            name="city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          >
            <option value="NYC">New York</option>
            <option value="SF">San Francisco</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="gender">You are</label>
        <select
          id="gender"
          className="field mt-1.5"
          name="gender"
          value={gender}
          onChange={(event) => setGender(event.target.value)}
          aria-invalid={e.gender ? true : undefined}
          aria-describedby={e.gender ? "gender-error" : undefined}
        >
          <option value="">Select one</option>
          {GENDER_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        {e.gender ? (
          <p id="gender-error" className="mt-1 text-xs text-claret">{e.gender}</p>
        ) : (
          <p className="mt-1 text-xs text-muted">Your matchmaker needs this, and so does the step below.</p>
        )}
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
          aria-describedby={e.birthdate ? "birthdate-error" : undefined}
        />
        {e.birthdate ? (
          <p id="birthdate-error" className="mt-1 text-xs text-claret">{e.birthdate}</p>
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

      {/* The gate. Two friends of the opposite gender have to write back before
          this application is accepted, so this is not a reference section at
          the bottom of a form - it is the application. The copy says exactly
          what happens next, because the applicant is about to put two friends'
          names into a stranger's website. */}
      <fieldset className="space-y-4 rounded-xl border border-line bg-panel p-4">
        <legend className="label px-1">Two friends who will vouch for you</legend>
        <p className="-mt-1 text-xs leading-relaxed text-muted">
          {vouchRule} We email them, they write a few sentences about you, and the moment both
          write back you are in. What they say goes on your profile.
        </p>

        {[1, 2].map((slot) => {
          const s = slot as 1 | 2;
          return (
            <div key={slot} className="space-y-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Friend {slot}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`rec${slot}Name`}>Their name</label>
                  <input
                    id={`rec${slot}Name`}
                    className="field mt-1.5"
                    name={`rec${slot}Name`}
                    defaultValue={rec(s, "Name")}
                    placeholder="Full name"
                    autoComplete="off"
                    aria-invalid={e[`rec${slot}Name`] ? true : undefined}
                    aria-describedby={e[`rec${slot}Name`] ? `rec${slot}Name-error` : undefined}
                  />
                  {e[`rec${slot}Name`] && (
                    <p id={`rec${slot}Name-error`} className="mt-1 text-xs text-claret">{e[`rec${slot}Name`]}</p>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor={`rec${slot}Gender`}>They are</label>
                  <select
                    id={`rec${slot}Gender`}
                    className="field mt-1.5"
                    name={`rec${slot}Gender`}
                    value={recGenders[slot - 1]}
                    onChange={(event) => setRecGender(s, event.target.value)}
                    aria-invalid={e[`rec${slot}Gender`] ? true : undefined}
                    aria-describedby={e[`rec${slot}Gender`] ? `rec${slot}Gender-error` : undefined}
                  >
                    <option value="">Select one</option>
                    {GENDER_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  {e[`rec${slot}Gender`] && (
                    <p id={`rec${slot}Gender-error`} className="mt-1 text-xs text-claret">{e[`rec${slot}Gender`]}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="label" htmlFor={`rec${slot}Email`}>Their email</label>
                <input
                  id={`rec${slot}Email`}
                  className="field mt-1.5"
                  name={`rec${slot}Email`}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  defaultValue={rec(s, "Email")}
                  placeholder="them@email.com"
                  aria-invalid={e[`rec${slot}Email`] ? true : undefined}
                  aria-describedby={e[`rec${slot}Email`] ? `rec${slot}Email-error` : undefined}
                />
                {e[`rec${slot}Email`] && (
                  <p id={`rec${slot}Email-error`} className="mt-1 text-xs text-claret">{e[`rec${slot}Email`]}</p>
                )}
              </div>
            </div>
          );
        })}

        <p className="text-xs text-muted">
          We email them once, and once more if they forget. We do not add them to anything, and we
          never email them again if they do not write back.
        </p>
      </fieldset>

      {/* Required agreement: age + Terms + Privacy. This is the only box needed
          to join. */}
      <div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="agree"
            className="mt-1"
            checked={agree}
            onChange={(event) => setAgree(event.target.checked)}
            aria-invalid={e.agree ? true : undefined}
            aria-describedby={e.agree ? "agree-error" : undefined}
          />
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
        {e.agree && <p id="agree-error" className="mt-1 text-xs text-claret">{e.agree}</p>}
      </div>

      {/* SEPARATE, OPTIONAL SMS opt-in. Unchecked by default and never required to
          join (CTIA / A2P 10DLC: SMS consent must not be bundled with, or a
          condition of, the service). Members who skip it are connected to matches
          by email instead. */}
      <div className="rounded-xl border border-line bg-paper/40 p-4">
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            name="smsConsent"
            className="mt-1"
            checked={smsConsent}
            onChange={(event) => setSmsConsent(event.target.checked)}
          />
          <span className="text-muted">
            <span className="font-medium text-ink">Text me my introductions (optional).</span> I agree to
            receive recurring text messages (SMS) from Mutuals about my matchmaking introductions at
            the mobile number above. Message and data rates may apply; message frequency varies. Consent
            is not a condition of joining. Reply STOP to cancel, HELP for help.
          </span>
        </label>
        <p className="mt-2 pl-8 text-xs text-muted">
          Prefer not to? Leave this unchecked. You will still be introduced to your matches by email.
        </p>
      </div>

      <div>
        <SubmitButton className="btn-primary w-full py-3" pendingText="Submitting...">
          Submit application
        </SubmitButton>
        <p className="mt-2 text-center text-xs text-muted">
          {photoCount === 0
            ? "Add a photo above, then submit. We email your two friends the moment you do."
            : "We email your two friends the moment you submit."}
        </p>
      </div>
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
