import Link from "next/link";
import { photoAt, widthFor } from "@/lib/photo-url";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center text-[13px] font-semibold uppercase tracking-[0.19em] ${
        light ? "text-cream" : "text-ink"
      }`}
      aria-label="Mutuals home"
    >
      Mutuals
    </Link>
  );
}

export function Avatar({
  url,
  name,
  size = 44,
}: {
  url?: string | null;
  name: string;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("");
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoAt(url, widthFor(size))}
      loading="lazy"
      decoding="async"
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="inline-flex items-center justify-center rounded-full bg-paper font-medium text-ink"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

const STAGE_LABEL: Record<string, string> = {
  suggested: "Suggested",
  // Email double opt-in stages. Without these a live introduction rendered as
  // the raw enum ("invited") next to properly labelled rows.
  invited: "Invited",
  connecting: "Connecting",
  connected: "Connected",
  mutual_yes: "Mutual yes",
  date_scheduled: "Date scheduled",
  first_date: "First date",
  second_date: "Second date",
  relationship: "Together",
  exit: "Closed",
};

export function StageBadge({ stage }: { stage: string }) {
  // Three states, distinguished by weight and fill rather than hue, so the
  // badge reads the same in the greyscale console as on the warm public pages:
  // reached the outcome (solid), closed (quiet), still in flight (outlined).
  const tone =
    stage === "relationship" || stage === "connected"
      ? "bg-ink text-white border-ink"
      : stage === "exit"
        ? "bg-studio-canvas text-muted border-line"
        : "bg-transparent text-ink border-ink/30";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}
    >
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}
