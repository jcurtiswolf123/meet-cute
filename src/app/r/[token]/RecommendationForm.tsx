"use client";

import { useActionState } from "react";
import { submitRecommendation, endorseRecommendation, type RecommendationState } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";

// The friend writes here. One textarea that matters, one optional line of
// context, and no account: everything asked of someone doing a favour costs
// replies, and replies are the whole product.
export function RecommendationForm({
  token,
  applicantFirst,
  endorsed,
}: {
  token: string;
  applicantFirst: string;
  /** They have already tapped. The words are the only thing still open. */
  endorsed?: boolean;
}) {
  const [state, formAction] = useActionState<RecommendationState, FormData>(submitRecommendation, {});

  return (
    <>
      {/* The one-tap vouch, above the writing, because most people answering
          this are on a phone and the gap between a tap and a paragraph is the
          gap between an answer today and no answer at all. It counts toward
          the gate on its own. It is deliberately not a link in the email: mail
          scanners follow links, and a scanner must never be able to vouch for
          somebody. */}
      {!endorsed && (
        <form action={endorseRecommendation} className="mt-8">
          <input type="hidden" name="token" value={token} />
          <SubmitButton className="btn-primary w-full py-3" pendingText="Recording...">
            Yes, I vouch for {applicantFirst}
          </SubmitButton>
          <p className="mt-2 text-center text-xs text-muted">
            One tap and they are vouched for. Words are optional, and they are what shows on the
            profile, so please add them if you can.
          </p>
        </form>
      )}

      <form action={formAction} className="mt-8 space-y-5">
        <input type="hidden" name="token" value={token} />

      <div>
        <label className="label" htmlFor="body">
          What would you say about {applicantFirst}?
        </label>
        <textarea
          id="body"
          name="body"
          className="field mt-1.5 min-h-40"
          defaultValue={state.values?.body ?? ""}
          placeholder={`What ${applicantFirst} is like, what makes them worth meeting, and anything you would tell a friend before setting them up.`}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "body-error" : "body-hint"}
        />
        {state.error ? (
          <p id="body-error" role="alert" className="mt-1 text-xs text-claret">
            {state.error}
          </p>
        ) : (
          <p id="body-hint" className="mt-1 text-xs text-muted">
            A few sentences is plenty. This shows on {applicantFirst}&rsquo;s profile in your words,
            so write it the way you would say it.
          </p>
        )}
      </div>

      <div>
        <label className="label" htmlFor="relationship">
          How do you know each other? <span className="text-muted">(optional)</span>
        </label>
        <input
          id="relationship"
          name="relationship"
          className="field mt-1.5"
          defaultValue={state.values?.relationship ?? ""}
          placeholder="Roommates in college, worked together at Stripe, and so on"
        />
      </div>

        <SubmitButton
          className={`${endorsed ? "btn-primary" : "btn-ghost"} w-full py-3`}
          pendingText="Sending..."
        >
          {endorsed ? "Add my words" : "Send my recommendation"}
        </SubmitButton>
      </form>
    </>
  );
}
