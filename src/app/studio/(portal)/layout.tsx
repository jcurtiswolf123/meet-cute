import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { PortalNav } from "@/components/PortalNav";

export const dynamic = "force-dynamic";

const STUDIO_NAV = [
  { href: "/studio/matchmaking", label: "Matchmaking" },
  { href: "/studio", label: "Directory" },
  { href: "/studio/pipeline", label: "Status" },
  { href: "/studio/events", label: "Events" },
  { href: "/studio/copilot", label: "Co-pilot" },
  { href: "/studio/team", label: "Team" },
];

export default async function StudioPortalLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentPerson();
  if (!me) redirect("/studio/login");
  if (!me.isOperator) redirect("/app");

  return (
    <>
      <PortalNav
        brand={
          <Link href="/studio" className="font-display text-lg font-medium">
            Meet Cute <span className="text-muted">Studio</span>
          </Link>
        }
        items={STUDIO_NAV}
        homeHref="/studio"
        userName={me.name}
        tone="white"
      />
      <main className="container-mc py-8">{children}</main>
    </>
  );
}
