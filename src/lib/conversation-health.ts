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

/** Compact latency for a badge: minutes under an hour, hours under two days,
 *  then days. Gives the operator hours-level resolution on fresh activity
 *  ("Waiting on Maya 30h") instead of rounding everything to whole days. */
function ageShort(d: Date | null | undefined, now: Date): string | null {
  if (!d) return null;
  const ms = now.getTime() - d.getTime();
  if (ms < 0) return "0m";
  const hours = ms / 3600000;
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60000))}m`;
  if (hours < 48) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** Human "time ago" for the console's last-activity column. */
export function relativeAge(d: Date | null | undefined, now: Date = new Date()): string {
  if (!d) return "no activity";
  const ms = now.getTime() - d.getTime();
  if (ms < 60000) return "just now";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
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
    const quietRef = input.lastMessageAt ?? input.connectedAt;
    const quietDays = daysSince(quietRef, now);
    const quietAge = ageShort(quietRef, now);
    if (quietDays !== null && quietDays >= 6) {
      return { label: `Connected, quiet ${quietAge}`, tone: "stale", needsAttention: true };
    }
    return { label: "Connected", tone: "good", needsAttention: false };
  }

  // invited / mutual_yes: waiting on one or both replies.
  const waitDays = daysSince(input.notifiedAt, now);
  const waitAge = ageShort(input.notifiedAt, now);
  const aYes = input.aDecision === "yes";
  const bYes = input.bDecision === "yes";

  if (aYes && !bYes) {
    const stale = waitDays !== null && waitDays >= 3;
    return { label: stale ? `Waiting on ${b} ${waitAge}` : `${a} said yes`, tone: stale ? "stale" : "warn", needsAttention: stale };
  }
  if (bYes && !aYes) {
    const stale = waitDays !== null && waitDays >= 3;
    return { label: stale ? `Waiting on ${a} ${waitAge}` : `${b} said yes`, tone: stale ? "stale" : "warn", needsAttention: stale };
  }

  // neither decided yet
  if (waitDays !== null && waitDays >= 3) {
    return { label: `No reply ${waitAge}`, tone: "stale", needsAttention: true };
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
