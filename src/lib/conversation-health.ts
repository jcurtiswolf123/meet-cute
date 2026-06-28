// Conversation health: a small, pure scorer the operator console uses to flag
// which introductions need a human. No DB access here so it is trivially
// testable and reusable on both the list and detail views.

export type HealthInput = {
  stage: string;
  aDecision: string;
  bDecision: string;
  aName: string;
  bName: string;
  notifiedAt?: Date | null; // most recent invite send
  connectedAt?: Date | null;
  lastMessageAt?: Date | null; // newest transcript entry, if any
  now?: Date;
};

export type Health = {
  label: string;
  tone: "good" | "warn" | "stale" | "neutral";
  needsAttention: boolean;
};

const DAY = 24 * 3600 * 1000;

function daysSince(d: Date | null | undefined, now: Date): number | null {
  if (!d) return null;
  return Math.floor((now.getTime() - d.getTime()) / DAY);
}

function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Map an intro's stage + timing to a health badge. Thresholds are deliberately
 *  conservative: a reply usually comes within a day, so 3+ days of silence on a
 *  pending invite, or 6+ days quiet after connecting, is worth a nudge. */
export function conversationHealth(input: HealthInput): Health {
  const now = input.now ?? new Date();
  const a = first(input.aName);
  const b = first(input.bName);

  if (input.stage === "exit") {
    return { label: "Closed", tone: "neutral", needsAttention: false };
  }

  if (input.stage === "connected") {
    const quiet = daysSince(input.lastMessageAt ?? input.connectedAt, now);
    if (quiet !== null && quiet >= 6) {
      return { label: `Connected, quiet ${quiet}d`, tone: "stale", needsAttention: true };
    }
    return { label: "Connected", tone: "good", needsAttention: false };
  }

  // invited / mutual_yes: waiting on one or both replies.
  const waitDays = daysSince(input.notifiedAt, now);
  const aYes = input.aDecision === "yes";
  const bYes = input.bDecision === "yes";

  if (aYes && !bYes) {
    const stale = waitDays !== null && waitDays >= 3;
    return { label: stale ? `Waiting on ${b} ${waitDays}d` : `${a} said yes`, tone: stale ? "stale" : "warn", needsAttention: stale };
  }
  if (bYes && !aYes) {
    const stale = waitDays !== null && waitDays >= 3;
    return { label: stale ? `Waiting on ${a} ${waitDays}d` : `${b} said yes`, tone: stale ? "stale" : "warn", needsAttention: stale };
  }

  // neither decided yet
  if (waitDays !== null && waitDays >= 3) {
    return { label: `No reply ${waitDays}d`, tone: "stale", needsAttention: true };
  }
  return { label: "Awaiting both", tone: "warn", needsAttention: false };
}

export function toneClass(tone: Health["tone"]): string {
  switch (tone) {
    case "good":
      return "bg-sage/15 text-sage border-sage/30";
    case "warn":
      return "bg-champagne/20 text-ink border-champagne/40";
    case "stale":
      return "bg-claret/10 text-claret border-claret/25";
    default:
      return "bg-paper text-muted border-line";
  }
}
