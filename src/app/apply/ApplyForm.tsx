"use client";

import Link from "next/link";
import { useActionState } from "react";
import { completeApplication, type ApplyState } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";

type Defaults = {
  first: string;
  last: string;
  phone: string;
  city: string;
  instagram: string;
  linkedin: string;
  lookingFor: string;
  maxBirthdate: string;
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
        <Field label="First name" name="first" defaultValue={val("first")} error={e.first} required />
        <Field label="Last name" name="last" defaultValue={val("last")} error={e.last} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="phone">Mobile number</label>
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
            <p className="mt-1 text-xs text-muted">Your matchmaker texts introductions here. Reply Y to opt in.</p>
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
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input
        id={name}
        className="field mt-1.5"
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required={required}
        aria-invalid={error ? true : undefined}
      />
      {error && <p className="mt-1 text-xs text-claret">{error}</p>}
    </div>
  );
}
