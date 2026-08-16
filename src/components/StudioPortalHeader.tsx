"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PortalIcon } from "@/components/PortalSidebar";
import { studioPage } from "@/lib/studio-nav";

// Where you are, and the two things worth reaching from anywhere. Co-pilot
// moved here from the rail on 2026-08-16: it is one chat box, a tool rather
// than a place, and it was taking a slot next to the seven destinations.
export function StudioPortalHeader() {
  const current = studioPage(usePathname());

  return (
    <header className="hidden h-8 shrink-0 items-center justify-between gap-3 md:flex">
      <div className="flex min-w-0 items-center gap-2 px-0.5">
        <span className="text-muted">
          <PortalIcon name={current.icon} />
        </span>
        <span className="truncate text-[13px] font-medium text-ink">{current.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/studio/copilot"
          className="inline-flex h-7 items-center gap-1.5 rounded border border-line bg-studio-subtle px-2.5 text-[12px] font-medium text-muted transition hover:border-ink/20 hover:bg-ink/[0.025] hover:text-ink"
        >
          <PortalIcon name="wand" />
          Co-pilot
        </Link>
        <Link
          href="/studio/matchmaking"
          className="inline-flex h-7 items-center gap-1.5 rounded border border-line bg-studio-subtle px-2.5 text-[12px] font-medium text-ink transition hover:border-ink/20 hover:bg-ink/[0.025]"
        >
          <PortalIcon name="sparkles" />
          New introduction
        </Link>
      </div>
    </header>
  );
}
