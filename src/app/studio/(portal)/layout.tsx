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

function studioSections(waiting: number): SidebarSection[] {
  return [
    {
      label: "Workspace",
      items: [
        { href: "/studio/matchmaking", label: "Matchmaking", icon: "sparkles" },
        { href: "/studio/conversations", label: "Conversations", icon: "message" },
        { href: "/studio/matches", label: "Matches", icon: "heart" },
        // Applicants sit above the directory because reviewing them is the
        // first thing an operator does in a session and the one thing somebody
        // outside is waiting on. The count is the whole point of the row.
        { href: "/studio/applicants", label: "Applicants", icon: "user", badge: waiting },
        { href: "/studio", label: "Directory", icon: "users" },
        { href: "/studio/pipeline", label: "Status", icon: "columns" },
      ],
    },
    {
      label: "Manage",
      items: [
        { href: "/studio/delivery", label: "Delivery", icon: "mail" },
        { href: "/studio/events", label: "Events", icon: "calendar" },
        { href: "/studio/venues", label: "Venues", icon: "home" },
        { href: "/studio/copilot", label: "Co-pilot", icon: "wand" },
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
        homeHref="/studio"
        userName={me.name}
        variant="twenty"
        hoverExpand
        defaultCollapsed
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-2 md:p-3 md:pl-0">
        <StudioPortalHeader />
        <main
          id={SCROLL_CONTAINER_ID}
          className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-studio-line bg-white"
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
