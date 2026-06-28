import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { PortalNav } from "@/components/PortalNav";

export const dynamic = "force-dynamic";

// Members see a deliberately small surface: their home, the people they have
// been connected to, their own profile, and account settings. Matching now
// happens over SMS (operator-driven), so there is no in-app browse/swipe feed
// and no roster of other members. See lib/social.ts connectedPersonIds.
const MEMBER_NAV = [
  { href: "/app", label: "Home" },
  { href: "/app/connections", label: "Connections" },
  { href: "/app/profile", label: "Profile" },
  { href: "/app/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentPerson();
  if (!me) redirect("/login");
  if (me.isOperator) redirect("/studio");

  return (
    <div className="min-h-screen">
      <PortalNav
        brand={<Logo />}
        items={MEMBER_NAV}
        homeHref="/app"
        avatarUrl={me.photos[0]?.url}
        userName={me.name}
      />
      <main className="container-mc py-10">{children}</main>
    </div>
  );
}
