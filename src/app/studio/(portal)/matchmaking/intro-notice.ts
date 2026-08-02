// Operator-readable copy for every outcome of createIntroduction, keyed by the
// short code the action puts in `?intro=`. All three pages that host
// IntroComposer (Directory, Matchmaking, and a person profile) render these, so
// a refusal explains itself where the operator sent it from.
//
// Before this existed, each refusal was a raw `throw` in a server action, which
// Next.js hands to the global error boundary: the operator saw "Something went
// sideways." with no reason, and Sentry logged an issue per click.
export const INTRO_MESSAGE: Record<string, string> = {
  sent: "Introductions sent. Both people have the other's profile and can say Yes or Pass.",
  "pick-two": "Pick two people before sending.",
  "same-person": "Pick two different people.",
  "missing-person": "One of those people is no longer on the list. Reload and try again.",
  "not-approved":
    "Both people have to be approved members first. Approve them in Directory, then send.",
  "no-channel":
    "Both people need an email, or a phone with recorded text consent, before an introduction can reach them.",
  "already-open":
    "These two already have an invitation out and unanswered. Use Resend on that introduction rather than starting a new one.",
  blocked: "These two cannot be introduced. One of them blocked the other.",
};

export function introNotice(code: string | undefined): string | undefined {
  return code ? INTRO_MESSAGE[code] : undefined;
}
