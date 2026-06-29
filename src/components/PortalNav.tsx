"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui";
import { logout } from "@/lib/actions";

export type PortalNavItem = { href: string; label: string };

// Responsive portal top bar shared by the member app and the matchmaker studio.
// Desktop: brand + inline nav + sign-out on one row. Mobile: brand + sign-out on
// row one, and the nav becomes a horizontally scrollable tab strip on row two so
// every destination is reachable without the links overflowing off-screen.
export function PortalNav({
  brand,
  items,
  homeHref,
  avatarUrl,
  userName,
  tone = "cream",
}: {
  brand: ReactNode;
  items: PortalNavItem[];
  homeHref: string;
  avatarUrl?: string | null;
  userName: string;
  tone?: "cream" | "white";
}) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === homeHref ? pathname === href : pathname.startsWith(href));
  const barBg = tone === "white" ? "bg-panel" : "bg-cream/80 backdrop-blur";

  return (
    <header className={`border-b border-line ${barBg}`}>
      <div className="container-mc flex items-center justify-between gap-3 py-4">
        <div className="shrink-0 whitespace-nowrap">{brand}</div>

        <nav className="hidden items-center gap-1 text-sm md:flex">
          {items.map((it) => (
            <NavLink key={it.href} item={it} active={isActive(it.href)} />
          ))}
        </nav>

        <form action={logout} className="shrink-0 md:ml-2">
          <button className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition hover:bg-paper" title={`Sign out (${userName})`}>
            <Avatar url={avatarUrl} name={userName} size={28} />
            <span className="hidden text-xs text-muted sm:inline">Sign out</span>
          </button>
        </form>
      </div>

      {/* Mobile tab strip: horizontally scrollable, every destination reachable. */}
      <nav className="flex gap-1 overflow-x-auto px-4 pb-2 text-sm [-ms-overflow-style:none] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
        {items.map((it) => (
          <NavLink key={it.href} item={it} active={isActive(it.href)} compact />
        ))}
      </nav>
    </header>
  );
}

function NavLink({ item, active, compact }: { item: PortalNavItem; active: boolean; compact?: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-3 py-1.5 transition ${compact ? "shrink-0 whitespace-nowrap" : ""} ${
        active ? "bg-claret/10 font-medium text-claret" : "text-muted hover:bg-paper hover:text-ink"
      }`}
    >
      {item.label}
    </Link>
  );
}
