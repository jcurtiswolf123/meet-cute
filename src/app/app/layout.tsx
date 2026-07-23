import { requireMemberPage } from "@/lib/page-auth";
import { PortalSidebar, type SidebarSection } from "@/components/PortalSidebar";

export const dynamic = "force-dynamic";

// Members see a deliberately small surface: their home, the people they have
// been connected to, their own profile, and account settings. Matching now
// happens over SMS (operator-driven), so there is no in-app browse/swipe feed
// and no roster of other members. See lib/social.ts connectedPersonIds.
const MEMBER_SECTIONS: SidebarSection[] = [
  {
    items: [
      { href: "/app", label: "Home", icon: "home" },
      { href: "/app/connections", label: "Connections", icon: "heart" },
      { href: "/app/profile", label: "Profile", icon: "user" },
      { href: "/app/settings", label: "Settings", icon: "settings" },
    ],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMemberPage();

  return (
    <div className="flex min-h-screen flex-col bg-cream md:flex-row">
      <PortalSidebar
        workspace="Meet Cute"
        sections={MEMBER_SECTIONS}
        homeHref="/app"
        avatarUrl={me.photos[0]?.url}
        userName={me.name}
      />
      <div className="min-w-0 flex-1">
        <main className="mx-auto w-full max-w-5xl px-6 py-10">{children}</main>
      </div>
    </div>
  );
}
