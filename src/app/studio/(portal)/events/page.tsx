import { requireOperatorPage } from "@/lib/page-auth";
import { StudioTabs } from "@/components/StudioTabs";
import { DinnersView, upcomingEventCount } from "./DinnersView";
import { VenuesView, venueCount } from "./VenuesView";

export const dynamic = "force-dynamic";

// Dinners and venues are the same question asked twice: where do these people
// go. They were two rail items. `/studio/venues` still redirects here.
type View = "dinners" | "venues";

const BLURB: Record<View, string> = {
  dinners:
    "Curated dinners and gatherings. Create an event, then add invitees from the list in one click. They get an email automatically.",
  venues: "Where the connection email suggests two people go once they have both said yes.",
};

export default async function Events({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [, sp] = await Promise.all([requireOperatorPage(), searchParams]);
  const view: View = sp.view === "venues" ? "venues" : "dinners";

  const [dinners, venues] = await Promise.all([upcomingEventCount(), venueCount()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans tracking-[-0.012em] text-2xl font-medium">Events</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">{BLURB[view]}</p>
      </div>

      <StudioTabs
        ariaLabel="Event views"
        active={view}
        hrefFor={(key) => (key === "dinners" ? "/studio/events" : `/studio/events?view=${key}`)}
        tabs={[
          { key: "dinners", label: "Dinners", count: dinners },
          { key: "venues", label: "Venues", count: venues },
        ]}
      />

      {view === "dinners" ? <DinnersView /> : <VenuesView />}
    </div>
  );
}
