"use client";

import { useActionState, useState } from "react";
import { submitApplicationFriends, type ApplyState } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";
import { ChoiceGroup } from "@/components/fields";

const GENDER_OPTIONS = [
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "nonbinary", label: "Non-binary" },
] as const;

// The second half. Everything about the applicant is already saved, so this
// page can only ever add to it: there is no submit here that can lose anything,
// which is the entire reason the application was split.
export function ApplyFriendsForm({
  gender,
  recommenders,
  fastTrack,
}: {
  gender: string;
  recommenders: { name: string; email: string; gender: string }[];
  fastTrack: { memberName: string } | null;
}) {
  const [state, formAction] = useActionState<ApplyState, FormData>(submitApplicationFriends, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  const slots = fastTrack ? [1] : [1, 2];
  const rec = (slot: 1 | 2, field: "Name" | "Email" | "Gender") =>
    v[`rec${slot}${field}`] ??
    recommenders[slot - 1]?.[field.toLowerCase() as "name" | "email" | "gender"] ??
    "";
  const [recGenders, setRecGenders] = useState<[string, string]>([rec(1, "Gender"), rec(2, "Gender")]);
  const setRecGender = (slot: 1 | 2, value: string) =>
    setRecGenders((prev) => (slot === 1 ? [value, prev[1]] : [prev[0], value]));

  const rule =
    gender === "woman"
      ? `Name ${fastTrack ? "one more man" : "two men"} who ${fastTrack ? "knows" : "know"} you well.`
      : gender === "man"
        ? `Name ${fastTrack ? "one more woman" : "two women"} who ${fastTrack ? "knows" : "know"} you well.`
        : `Name ${fastTrack ? "one more friend" : "two friends"} who ${fastTrack ? "knows" : "know"} you well.`;

  return (
    <form className="mt-8 space-y-5" action={formAction} noValidate>
      {fastTrack && (
        <p className="rounded-lg border border-claret/25 bg-claret/[0.05] px-3 py-2 text-xs leading-relaxed text-ink">
          You vouched for <strong>{fastTrack.memberName}</strong>, so they count as one of your two.
          We have asked them to write one back for you.
        </p>
      )}
      <p className="text-sm leading-relaxed text-muted">
        {rule} We email them, they answer in a couple of sentences or with one tap, and the moment
        both have, you are a member. There is nobody to impress in between.
      </p>

      {slots.map((slot) => {
        const s = slot as 1 | 2;
        return (
          <div key={slot} className="space-y-3 rounded-xl2 border border-line bg-panel p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {fastTrack ? "Your friend" : `Friend ${slot}`}
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
                />
                {e[`rec${slot}Name`] && (
                  <p className="mt-1 text-xs text-claret">{e[`rec${slot}Name`]}</p>
                )}
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
                />
                {e[`rec${slot}Email`] && (
                  <p className="mt-1 text-xs text-claret">{e[`rec${slot}Email`]}</p>
                )}
              </div>
            </div>
            <ChoiceGroup
              name={`rec${slot}Gender`}
              label="They are"
              required
              options={GENDER_OPTIONS}
              value={recGenders[slot - 1]}
              onChange={(next) => setRecGender(s, next)}
              error={e[`rec${slot}Gender`]}
            />
          </div>
        );
      })}

      <div>
        <label className="label" htmlFor="applicantNote">
          Anything you want us to say to them? <span className="text-muted">(optional)</span>
        </label>
        <input
          id="applicantNote"
          className="field mt-1.5"
          name="applicantNote"
          defaultValue={v.applicantNote ?? ""}
          maxLength={200}
          placeholder="One line, in your words. It goes at the top of the email they get."
        />
      </div>

      <div>
        <SubmitButton className="btn-primary w-full py-3" pendingText="Sending...">
          {fastTrack ? "Send the ask" : "Send the asks"}
        </SubmitButton>
        <p className="mt-2 text-center text-xs text-muted">
          We email them once, and nudge them twice if they forget. They never hear from us again
          after that.
        </p>
      </div>
    </form>
  );
}
