"use client";

import Link from "next/link";
import { useState } from "react";
import { saveApplicationBasics } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";
import { ChoiceGroup, Checkbox } from "@/components/fields";
import { CITIES } from "@/lib/cities";

type Defaults = {
  first: string;
  last: string;
  email: string;
  phone: string;
  city: string;
  secondCity: string;
  gender: string;
  instagram: string;
  linkedin: string;
  lookingFor: string;
  maxBirthdate: string;
  /** YYYY-MM-DD, from the row, so a re-render does not blank it. */
  birthdate: string;
  /** Already agreed on a previous save. A native re-render reloads the page,
   *  so without this the box a person already ticked comes back empty and the
   *  same error repeats forever. */
  agreed: boolean;
  smsConsent: boolean;
};

const GENDER_OPTIONS = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "nonbinary", label: "Non-binary" },
] as const;

const CITY_OPTIONS = CITIES.map((city) => ({ value: city.value, label: city.label }));

// The applicant's completion form. A client component so validation problems
// render inline next to the offending field and nothing they typed is lost on a
// failed submit (the server action echoes the values back through state).
export function ApplyBasicsForm({
  defaults,
  photoCount,
  errors,
}: {
  defaults: Defaults;
  /** Live count from the uploader above, which posts outside this form. */
  photoCount: number;
  /** Read off the query string by the page, keyed by field. */
  errors?: Record<string, string>;
}) {
  // Errors arrive in the query string, not from useActionState, because this
  // form has to work before React does. Values come back from the row: the
  // action saves everything valid even on a failed submit, so a native
  // re-render hands the applicant back their own work.
  const e = errors ?? {};
  const v: Record<string, string> = {};
  // Prefer the just-typed value (on a re-render after an error), else the
  // server-provided default.
  const val = (k: keyof Omit<Defaults, "recommenders">) => v[k] ?? defaults[k];

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
  const [city, setCity] = useState(val("city") || "NYC");
  const [secondCity, setSecondCity] = useState(val("secondCity"));
  const [agree, setAgree] = useState(defaults.agreed);
  const [smsConsent, setSmsConsent] = useState(defaults.smsConsent);



  return (
    <form className="mt-8 space-y-5" action={saveApplicationBasics} noValidate>
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
        <ChoiceGroup
          name="city"
          label="City"
          required
          options={CITY_OPTIONS}
          value={city}
          onChange={(next) => {
            setCity(next);
            // Picking a primary that matches the second leaves someone listed
            // twice in one market rather than present in two.
            if (next === secondCity) setSecondCity("");
          }}
        />
      </div>
      {/* Plenty of people genuinely live in two of these. Picking one made
          them invisible to the matchmaker in the other half of their life. */}
      <ChoiceGroup
        name="secondCity"
        label="Also there often"
        options={[
          { value: "", label: "Just one city" },
          ...CITY_OPTIONS.filter((option) => option.value !== city),
        ]}
        value={secondCity}
        onChange={setSecondCity}
        hint="Optional. Pick a second city and your matchmaker can introduce you in both."
      />
      <ChoiceGroup
        name="gender"
        label="You are"
        required
        options={GENDER_OPTIONS}
        value={gender}
        onChange={setGender}
        error={e.gender}
        hint="Your matchmaker needs this, and so does the step below."
      />
      <div>
        <label className="label" htmlFor="birthdate">Date of birth</label>
        <input
          id="birthdate"
          className="field mt-1.5"
          name="birthdate"
          type="date"
          max={defaults.maxBirthdate}
          defaultValue={defaults.birthdate}
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

      <Checkbox name="agree" checked={agree} onChange={setAgree} error={e.agree}>
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

      {/* SEPARATE, OPTIONAL SMS opt-in. Unchecked by default and never required to
          join (CTIA / A2P 10DLC: SMS consent must not be bundled with, or a
          condition of, the service). Members who skip it are connected to matches
          by email instead. */}
      <div className="rounded-xl border border-line bg-paper/40 p-4">
        <Checkbox name="smsConsent" checked={smsConsent} onChange={setSmsConsent}>
          <span className="font-medium text-ink">Text me my introductions (optional).</span> I agree to
          receive recurring text messages (SMS) from Mutuals about my matchmaking introductions at
          the mobile number above. Message and data rates may apply; message frequency varies. Consent
          is not a condition of joining. Reply STOP to cancel, HELP for help.
        </Checkbox>
        <p className="mt-2 pl-8 text-xs text-muted">
          Prefer not to? Leave this unchecked. You will still be introduced to your matches by email.
        </p>
      </div>

      <div>
        <SubmitButton className="btn-primary w-full py-3" pendingText="Saving...">
          Save and continue
        </SubmitButton>
        <p className="mt-2 text-center text-xs text-muted">
          {photoCount === 0
            ? "Add a photo above, then save. Nothing is sent yet."
            : "Saved as soon as you press this. Next is the two friends who vouch for you, and you can come back to it."}
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
