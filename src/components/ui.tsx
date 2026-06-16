import Link from "next/link";

export function Logo({ subtle = false, light = false }: { subtle?: boolean; light?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-baseline gap-1.5">
      <span className={`font-display text-xl font-medium tracking-tight ${light ? "text-cream" : "text-ink"}`}>Meet Cute</span>
      {!subtle && <span className={light ? "text-champagne" : "text-claret"}>♥</span>}
    </Link>
  );
}

export function Avatar({ url, name, size = 44 }: { url?: string | null; name: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="inline-flex items-center justify-center rounded-full bg-paper font-display text-ink"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

const STAGE_LABEL: Record<string, string> = {
  suggested: "Suggested",
  mutual_yes: "Mutual yes",
  date_scheduled: "Date scheduled",
  first_date: "First date",
  second_date: "Second date",
  relationship: "Together",
  exit: "Closed",
};

export function StageBadge({ stage }: { stage: string }) {
  const tone =
    stage === "relationship"
      ? "bg-sage/15 text-sage border-sage/30"
      : stage === "exit"
        ? "bg-paper text-muted border-line"
        : "bg-claret/10 text-claret border-claret/25";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}
