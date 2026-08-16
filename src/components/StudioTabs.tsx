import Link from "next/link";

// One destination, several ways to look at it. Used where the sidebar carried
// separate items for what is really one object: a match (live, board, all) and
// a place to eat (dinners, venues).
//
// Links rather than client state, because each view is a server component doing
// its own reads, and because a view has to be linkable: `actions.ts` redirects
// back to a specific one after a bulk resend.
export type StudioTab = { key: string; label: string; count?: number };

export function StudioTabs({
  tabs,
  active,
  hrefFor,
  ariaLabel,
}: {
  tabs: StudioTab[];
  active: string;
  hrefFor: (key: string) => string;
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      // Scrolls rather than wraps on a narrow screen: a wrapped second row of
      // tabs reads as a second navigation.
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition ${
              isActive
                ? "border-ink bg-ink text-white"
                : "border-line text-muted hover:border-studio-line hover:text-ink"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`text-xs tabular-nums ${isActive ? "text-white/70" : "text-muted"}`}
              >
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
