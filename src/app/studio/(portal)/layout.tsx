import { requireOperatorPage } from "@/lib/page-auth";
import { PortalSidebar, type SidebarSection } from "@/components/PortalSidebar";
import { StudioPortalHeader } from "@/components/StudioPortalHeader";

export const dynamic = "force-dynamic";

const STUDIO_SECTIONS: SidebarSection[] = [
  {
    label: "Workspace",
    items: [
      { href: "/studio/matchmaking", label: "Matchmaking", icon: "sparkles" },
      { href: "/studio/conversations", label: "Conversations", icon: "message" },
      { href: "/studio/matches", label: "Matches", icon: "heart" },
      { href: "/studio", label: "Directory", icon: "users" },
      { href: "/studio/pipeline", label: "Status", icon: "columns" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/studio/delivery", label: "Delivery", icon: "mail" },
      { href: "/studio/events", label: "Events", icon: "calendar" },
      { href: "/studio/copilot", label: "Co-pilot", icon: "wand" },
      { href: "/studio/team", label: "Team", icon: "userCog" },
    ],
  },
];

export default async function StudioPortalLayout({ children }: { children: React.ReactNode }) {
  const me = await requireOperatorPage();

  return (
    // studio-shell scopes the neutral working palette. The marketing site keeps
    // the warm cream and claret; an operator console staring at the same screen
    // all day wants greyscale with one accent reserved for things that need a
    // decision.
    <div className="studio-shell flex h-dvh flex-col overflow-hidden bg-[#f5f5f6] md:flex-row">
      <PortalSidebar
        workspace="Mutuals"
        subtitle="Studio"
        sections={STUDIO_SECTIONS}
        homeHref="/studio"
        userName={me.name}
        variant="twenty"
        hoverExpand
        defaultCollapsed
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-2 md:p-3 md:pl-0">
        <StudioPortalHeader />
        <main className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[#e3e3e6] bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
