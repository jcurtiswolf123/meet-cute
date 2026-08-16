import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { PortalSidebar, type SidebarSection } from "@/components/PortalSidebar";
import { StudioPortalHeader } from "@/components/StudioPortalHeader";
import { StudioScrollMemory } from "@/components/StudioScrollMemory";
import { StudioHotkeys } from "@/components/StudioHotkeys";

export const dynamic = "force-dynamic";

// The one element the studio scrolls in. Named so the scroll memory can find it
// from a client component without threading a ref through the whole tree.
const SCROLL_CONTAINER_ID = "studio-scroll";

// Seven items, down from eleven, on 2026-08-16. Four of the eleven were four
// ways to look at one match (Matchmaking's own board, Conversations, Matches,
// Status) and two were the same roster twice. What each page actually drew, and
// what folded into what, is in docs/STUDIO-STREAMLINE-2026-08-16.md.
//
// The rule the list is kept to: a rail item is a place an operator goes, and
// two items may not draw the same rows. Views of one object are tabs on that
// object's page; tools are in the header.
function studioSections(waiting: number): SidebarSection[] {
  return [
    {
      label: "Workspace",
      items: [
        { href: "/studio/matchmaking", label: "Matchmaking", icon: "sparkles" },
        // Live, Board and All are tabs here now.
        { href: "/studio/matches", label: "Matches", icon: "heart" },
        // Applicants sit above the directory because reviewing them is the
        // first thing an operator does in a session and the one thing somebody
        // outside is waiting on. The count is the whole point of the row.
        { href: "/studio/applicants", label: "Applicants", icon: "user", badge: waiting },
        { href: "/studio", label: "Directory", icon: "users" },
      ],
    },
    {
      label: "Manage",
      items: [
        { href: "/studio/delivery", label: "Delivery", icon: "mail" },
        // Dinners and Venues are tabs here now.
        { href: "/studio/events", label: "Events", icon: "calendar" },
        { href: "/studio/team", label: "Team", icon: "userCog" },
      ],
    },
  ];
}

export default async function StudioPortalLayout({ children }: { children: React.ReactNode }) {
  // Both in one lane: the layout renders alongside the page, and a second
  // serialised round trip to us-east-2 would show up on every studio page.
  const [me, waiting] = await Promise.all([
    requireOperatorPage(),
    prisma.person.count({
      where: {
        isOperator: false,
        isAmbassador: false,
        isCoach: false,
        status: "applicant",
        appliedAt: { not: null },
      },
    }),
  ]);

  return (
    // studio-shell scopes the neutral working palette. The marketing site keeps
    // the warm cream and claret; an operator console staring at the same screen
    // all day wants greyscale with one accent reserved for things that need a
    // decision.
    <div className="studio-shell flex h-dvh flex-col overflow-hidden bg-studio-canvas md:flex-row">
      <PortalSidebar
        workspace="Mutuals"
        subtitle="Studio"
        sections={studioSections(waiting)}
        // The desktop header carries Co-pilot as a button. On a phone there is
        // no header, so the drawer is where it has to live.
        mobileOnlySections={[
          { label: "Tools", items: [{ href: "/studio/copilot", label: "Co-pilot", icon: "wand" }] },
        ]}
        homeHref="/studio"
        userName={me.name}
        variant="twenty"
        hoverExpand
        defaultCollapsed
      />
      {/* The bottom inset keeps the last row of a list clear of the iPhone home
          indicator once the app is installed and runs without Safari's chrome.
          It is 0 everywhere else, so it costs nothing on a laptop. */}
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-2 md:p-3 md:pl-0"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <StudioPortalHeader />
        {/* `relative` is load-bearing. Tailwind's .sr-only is an absolutely
            positioned 1px box, and with no positioned ancestor it resolves
            against the document rather than against this scroller: the "Actions"
            label in the directory's table header landed 1,135px down the page
            and gave the window a second scrollbar over a screen of empty cream
            below the app frame. Any absolutely positioned descendant, present or
            future, now belongs to the container it is drawn in. */}
        <main
          id={SCROLL_CONTAINER_ID}
          className="relative min-h-0 flex-1 overflow-y-auto rounded-lg border border-studio-line bg-white"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>
      <StudioScrollMemory containerId={SCROLL_CONTAINER_ID} />
      <StudioHotkeys />
    </div>
  );
}
