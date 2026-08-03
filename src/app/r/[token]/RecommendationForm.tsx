"use client";

import { useActionState } from "react";
import { submitRecommendation, type RecommendationState } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";

// The friend writes here. One textarea that matters, one optional line of
// context, and no account: everything asked of someone doing a favour costs
// replies, and replies are the whole product.
export function RecommendationForm({
  token,
  applicantFirst,
}: {
  token: string;
  applicantFirst: string;
}) {
  const [state, formAction] = useActionState<RecommendationState, FormData>(submitRecommendation, {});

  return (
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

      <SubmitButton className="btn-primary w-full py-3" pendingText="Sending...">
        Send my recommendation
      </SubmitButton>
    </form>
  );
}
