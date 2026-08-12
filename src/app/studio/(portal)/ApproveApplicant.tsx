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
  // The applicant board reviews faces against a black ground, where ink on ink
  // is invisible. Same control, same friction, inverted.
  tone = "light",
}: {
  personId: string;
  name: string;
  outstanding: number;
  tone?: "light" | "dark";
}) {
  const [confirming, setConfirming] = useState(false);
  const first = name.split(" ")[0];
  const solid =
    tone === "dark"
      ? "rounded-full bg-white px-3 py-1 text-xs font-medium text-ink transition hover:bg-white/85"
      : "rounded-full bg-ink px-3 py-1 text-xs font-medium text-white transition hover:bg-ink/85";
  const outline =
    tone === "dark"
      ? "rounded-full border border-white px-3 py-1 text-xs font-medium text-white transition hover:bg-white/10"
      : "rounded-full border border-ink px-3 py-1 text-xs font-medium text-ink transition hover:bg-panel";

  if (outstanding === 0) {
    return (
      <form action={setMemberStatus}>
        <input type="hidden" name="personId" value={personId} />
        <input type="hidden" name="action" value="approve" />
        <SubmitButton className={solid} pendingText="...">
          Approve
        </SubmitButton>
      </form>
    );
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={outline}>
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
      <SubmitButton className={solid} pendingText="...">
        Override
      </SubmitButton>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className={`text-xs underline underline-offset-2 ${
          tone === "dark" ? "text-white/70" : "text-muted"
        }`}
      >
        Cancel
      </button>
    </form>
  );
}
