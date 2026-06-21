import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { logout } from "@/lib/actions";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentPerson();
  if (!me) redirect("/login");
  if (!me.isOperator) redirect("/app");

  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-line bg-white">
        <div className="container-mc flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Link href="/studio" className="font-display text-lg font-medium">Meet Cute <span className="text-muted">Studio</span></Link>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/studio" label="Roster" />
            <NavLink href="/studio/pipeline" label="Pipeline" />
            <NavLink href="/studio/moderation" label="Moderation" />
            <NavLink href="/studio/copilot" label="Co-pilot" />
            <NavLink href="/studio/team" label="Team" />
            <form action={logout} className="ml-2">
              <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-paper">
                <Avatar name={me.name} size={26} />
                <span className="text-xs text-muted">{me.name}</span>
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="container-mc py-8">{children}</main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="rounded-full px-3 py-1.5 text-muted transition hover:bg-paper hover:text-ink">
      {label}
    </Link>
  );
}
