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
  needed,
  recommenders,
  fastTrack,
  vouchedBy,
}: {
  /** How many friends to ask for: two, or one when something already counts. */
  needed: number;
  recommenders: { name: string; email: string; gender: string | null }[];
  fastTrack: { memberName: string } | null;
  /** People who have already written about them, which is how a nomination
   *  arrives: somebody put them forward before they applied. */
  vouchedBy: string[];
}) {
  const [state, formAction] = useActionState<ApplyState, FormData>(submitApplicationFriends, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};
  // Zero happens: two people put them forward and both wrote something, so the
  // gate is already satisfied and there is nobody left to ask.
  const slots = needed >= 2 ? [1, 2] : needed === 1 ? [1] : [];
  const rec = (slot: 1 | 2, field: "Name" | "Email" | "Gender") =>
    v[`rec${slot}${field}`] ??
    recommenders[slot - 1]?.[field.toLowerCase() as "name" | "email" | "gender"] ??
    "";
  const [recGenders, setRecGenders] = useState<[string, string]>([rec(1, "Gender"), rec(2, "Gender")]);
  const setRecGender = (slot: 1 | 2, value: string) =>
    setRecGenders((prev) => (slot === 1 ? [value, prev[1]] : [prev[0], value]));

  // "Any two friends", and nothing narrower.
  //
  // It used to be "two single men" or "two single women", matching a gate that
  // required two recommendations from the opposite gender. Both are gone (Jess,
  // 2026-08-06): people were stopping at this screen and saying they did not
  // have two single friends to name, and an applicant who cannot name anybody
  // does not become a better member, they become no member at all. The friends
  // who vouch are still the warmest leads Mutuals ever sees; they are just no
  // longer filtered down to the ones we could have matched.
  const rule =
    slots.length === 0
      ? "Two people have already written about you, which is everything this asks for."
      : slots.length === 1
        ? "Name one more friend who knows you well."
        : "Name any two friends who know you well.";

  return (
    <form className="mt-8 space-y-5" action={formAction} noValidate>
      {vouchedBy.length > 0 && (
        <p className="rounded-lg border border-claret/25 bg-claret/[0.05] px-3 py-2 text-xs leading-relaxed text-ink">
          {vouchedBy.length >= 2 ? (
            <>
              <strong>{vouchedBy[0]}</strong> and <strong>{vouchedBy[1]}</strong> have both written
              recommendations for you, so you are in as soon as you submit this.
            </>
          ) : (
            <>
              <strong>{vouchedBy[0]}</strong> already wrote a recommendation for you, so that is one
              of your two.
            </>
          )}
        </p>
      )}
      {fastTrack && (
        <p className="rounded-lg border border-claret/25 bg-claret/[0.05] px-3 py-2 text-xs leading-relaxed text-ink">
          You vouched for <strong>{fastTrack.memberName}</strong>, so they count as one of your two.
          We have asked them to write one back for you.
        </p>
      )}
      <p className="text-sm leading-relaxed text-muted">
        {rule}{" "}
        {slots.length === 0
          ? "Submit and you are a member. There is nobody to impress in between."
          : "We email them, they answer in a couple of sentences or with one tap, and the moment both have, you are a member. There is nobody to impress in between."}
      </p>

      {slots.map((slot) => {
        const s = slot as 1 | 2;
        return (
          <div key={slot} className="space-y-3 rounded-xl2 border border-line bg-panel p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              {slots.length === 1 ? "Your friend" : `Friend ${slot}`}
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

      {slots.length > 0 && (
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
      )}

      <div>
        <SubmitButton className="btn-primary w-full py-3" pendingText="Sending...">
          {slots.length === 0 ? "Finish my application" : slots.length === 1 ? "Send the ask" : "Send the asks"}
        </SubmitButton>
        {slots.length > 0 && (
          <p className="mt-2 text-center text-xs text-muted">
            We email them once, and nudge them twice if they forget. They never hear from us again
            after that.
          </p>
        )}
      </div>
    </form>
  );
}
