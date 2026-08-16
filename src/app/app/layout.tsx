import { requireMemberPage } from "@/lib/page-auth";
import { PortalSidebar, type SidebarSection } from "@/components/PortalSidebar";

export const dynamic = "force-dynamic";

// Members see a deliberately small surface: their home, the people they have
// been connected to, their own profile, and account settings. Matching is
// operator-led and email-first, so there is no in-app browse/swipe feed
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
    // dvh rather than vh: on iOS Safari, 100vh is the height with the toolbars
    // hidden, so a short page pushed its own footer under the address bar.
    <div className="flex min-h-dvh flex-col bg-cream md:flex-row">
      <PortalSidebar
        workspace="Mutuals"
        sections={MEMBER_SECTIONS}
        homeHref="/app"
        avatarUrl={me.photos[0]?.url}
        userName={me.name}
      />
      <div className="min-w-0 flex-1">
        {/* Roomier on a laptop, tighter on a phone, and clear of the home
            indicator once the app is installed to the home screen. */}
        <main
          className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-10"
          style={{ paddingBottom: "max(2rem, calc(env(safe-area-inset-bottom) + 1.5rem))" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
