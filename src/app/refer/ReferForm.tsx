"use client";

import Link from "next/link";
import { useActionState } from "react";
import { submitNomination, type ReferState } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";
import { LabelledField } from "@/components/LabelledField";

// The form somebody fills in about a friend. Four fields and a note, because
// the referral we want is the one made in the ten seconds after thinking of the
// person, and every extra question is a chance to close the tab.
//
// `noteMin` is passed in rather than imported: the constant lives in
// src/lib/nominations.ts, which imports Prisma, and importing it here would
// drag the database client into the browser bundle.
export function ReferForm({
  me,
  noteMin,
}: {
  me: { name: string; email: string } | null;
  noteMin: number;
}) {
  const [state, formAction] = useActionState<ReferState, FormData>(submitNomination, {});
  const v = state.values ?? {};
  const e = state.fieldErrors ?? {};

  if (state.sent) {
    const first = state.sent.name.split(" ")[0];
    return (
      <div className="mt-10 max-w-xl rounded-xl2 border border-line bg-panel p-6">
        <h2 className="font-display text-2xl">Thank you. We have written to {first}.</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {state.sent.counts
            ? `One email, from us, saying you put them forward and quoting what you wrote. If they apply, your words stand as one of the two recommendations they need, so they only have to ask one friend.`
            : `One email, from us, saying you put them forward. If they are not interested they will not hear from us again.`}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="/refer" className="btn-ghost px-7 py-3">
            Recommend somebody else
          </a>
          <Link href="/apply" className="btn-primary px-7 py-3">
            Join Mutuals yourself
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="mt-10 max-w-xl space-y-5" action={formAction} noValidate>
      <div className="space-y-4 rounded-xl2 border border-line bg-panel p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Who they are</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <LabelledField id="name" label="Their name">
            <input
              id="name"
              name="name"
              className="field mt-1.5"
              defaultValue={v.name ?? ""}
              placeholder="Full name"
              autoComplete="off"
              aria-invalid={e.name ? true : undefined}
            />
            {e.name && <p className="mt-1 text-xs text-claret">{e.name}</p>}
          </LabelledField>
          <LabelledField id="email" label="Their email">
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              className="field mt-1.5"
              defaultValue={v.email ?? ""}
              placeholder="them@email.com"
              autoComplete="off"
              aria-invalid={e.email ? true : undefined}
            />
            {e.email && <p className="mt-1 text-xs text-claret">{e.email}</p>}
          </LabelledField>
        </div>
      </div>

      <div className="space-y-4 rounded-xl2 border border-line bg-panel p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Who it is from</p>
        {me ? (
          <p className="text-sm text-muted">
            From {me.name} ({me.email}).
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <LabelledField id="fromName" label="Your name">
              <input
                id="fromName"
                name="fromName"
                className="field mt-1.5"
                defaultValue={v.fromName ?? ""}
                autoComplete="name"
                aria-invalid={e.fromName ? true : undefined}
              />
              {e.fromName && <p className="mt-1 text-xs text-claret">{e.fromName}</p>}
            </LabelledField>
            <LabelledField id="fromEmail" label="Your email">
              <input
                id="fromEmail"
                name="fromEmail"
                type="email"
                inputMode="email"
                className="field mt-1.5"
                defaultValue={v.fromEmail ?? ""}
                autoComplete="email"
                aria-invalid={e.fromEmail ? true : undefined}
              />
              {e.fromEmail && <p className="mt-1 text-xs text-claret">{e.fromEmail}</p>}
            </LabelledField>
          </div>
        )}
      </div>

      <LabelledField
        id="note"
        label="Why them? (optional)"
        hint={`A couple of sentences, and it counts as one of the two recommendations they need. Under ${noteMin} characters and it is just an introduction.`}
      >
        <textarea
          id="note"
          name="note"
          rows={4}
          maxLength={1200}
          className="field mt-1.5"
          defaultValue={v.note ?? ""}
          placeholder="What they are like, and what makes them worth meeting."
        />
      </LabelledField>

      <div>
        <SubmitButton className="btn-primary w-full py-3" pendingText="Sending...">
          Put them forward
        </SubmitButton>
        <p className="mt-2 text-center text-xs text-muted">
          We email them once, saying it came from you. If they are not interested they never hear
          from us again.
        </p>
      </div>
    </form>
  );
}
