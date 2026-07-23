import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { PortalSidebar, type SidebarSection } from "@/components/PortalSidebar";

export const dynamic = "force-dynamic";

const STUDIO_SECTIONS: SidebarSection[] = [
  {
    label: "Workspace",
    items: [
      { href: "/studio/matchmaking", label: "Matchmaking", icon: "sparkles" },
      { href: "/studio/conversations", label: "Conversations", icon: "message" },
      { href: "/studio", label: "Directory", icon: "users" },
      { href: "/studio/pipeline", label: "Status", icon: "columns" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/studio/events", label: "Events", icon: "calendar" },
      { href: "/studio/copilot", label: "Co-pilot", icon: "wand" },
      { href: "/studio/team", label: "Team", icon: "userCog" },
    ],
  },
];

export default async function StudioPortalLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentPerson();
  if (!me) redirect("/studio/login");
  if (!me.isOperator) redirect("/app");

  return (
    <div className="flex min-h-screen flex-col bg-cream md:flex-row">
      <PortalSidebar
        workspace="Meet Cute"
        subtitle="Studio"
        sections={STUDIO_SECTIONS}
        homeHref="/studio"
        userName={me.name}
      />
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
