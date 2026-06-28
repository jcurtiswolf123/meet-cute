import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { Logo } from "@/components/ui";
import { PortalNav } from "@/components/PortalNav";

export const dynamic = "force-dynamic";

const MEMBER_NAV = [
  { href: "/app", label: "For you" },
  { href: "/app/matches", label: "Matches" },
  { href: "/app/events", label: "Events" },
  { href: "/app/invite", label: "Invite" },
  { href: "/app/profile", label: "Profile" },
  { href: "/app/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentPerson();
  if (!me) redirect("/login");
  if (me.isOperator) redirect("/studio");
  // Removed/declined members lose access immediately (decline also revokes their
  // sessions); never let an exited account into the member app.
  if (me.status === "exited") redirect("/login");

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
