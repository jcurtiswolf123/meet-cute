import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { logout } from "@/lib/actions";
import { Avatar, Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentPerson();
  if (!me) redirect("/login");
  if (me.isOperator) redirect("/studio");

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-cream/80 backdrop-blur">
        <div className="container-mc flex items-center justify-between py-4">
          <Logo />
          <nav className="flex items-center gap-1 text-sm">
            <NavLink href="/app" label="For you" />
            <NavLink href="/app/matches" label="Matches" />
            <NavLink href="/app/invite" label="Invite" />
            <NavLink href="/app/profile" label="Profile" />
            <form action={logout} className="ml-2">
              <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-paper">
                <Avatar url={me.photos[0]?.url} name={me.name} size={28} />
                <span className="text-xs text-muted">Sign out</span>
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="container-mc py-10">{children}</main>
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
