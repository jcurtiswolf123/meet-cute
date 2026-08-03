"use client";

import { useState } from "react";
import { setMemberStatus } from "@/lib/actions";
import { SubmitButton } from "@/components/forms";

// Approving an applicant whose friends have not written yet is allowed, and it
// is the one action that quietly empties the recommendation gate. On the day
// the gate shipped, both applicants were approved by hand within an hour, so
// three of their four recommenders never had a reason to write anything and the
// loop had no fuel.
//
// So: when nothing is outstanding, this is an ordinary Approve button. When
// something is, it asks what the override is for and records the answer. The
// friction is the point, and it is one sentence long.
export function ApproveApplicant({
  personId,
  name,
  outstanding,
}: {
  personId: string;
  name: string;
  outstanding: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const first = name.split(" ")[0];

  if (outstanding === 0) {
    return (
      <form action={setMemberStatus}>
        <input type="hidden" name="personId" value={personId} />
        <input type="hidden" name="action" value="approve" />
        <SubmitButton
          className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white transition hover:bg-ink/85"
          pendingText="..."
        >
          Approve
        </SubmitButton>
      </form>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-full border border-ink px-3 py-1 text-xs font-medium text-ink transition hover:bg-panel"
      >
        Approve early
      </button>
    );
  }

  return (
    <form action={setMemberStatus} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="action" value="approve" />
      <input
        name="reason"
        required
        autoFocus
        placeholder={`Why let ${first} in before ${outstanding === 1 ? "their friend writes" : "their friends write"}?`}
        className="field !py-1 w-64 text-xs"
        aria-label={`Reason for approving ${name} early`}
      />
      <SubmitButton
        className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white transition hover:bg-ink/85"
        pendingText="..."
      >
        Override
      </SubmitButton>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-xs text-muted underline underline-offset-2"
      >
        Cancel
      </button>
    </form>
  );
}
