"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PortalIcon, type IconName } from "@/components/PortalSidebar";

const PAGE_CONTEXT: Array<{
  matches: (pathname: string) => boolean;
  label: string;
  icon: IconName;
}> = [
  {
    matches: (pathname) => pathname.startsWith("/studio/matchmaking"),
    label: "Matchmaking",
    icon: "sparkles",
  },
  {
    matches: (pathname) => pathname.startsWith("/studio/conversations"),
    label: "Conversations",
    icon: "message",
  },
  {
    matches: (pathname) => pathname.startsWith("/studio/person/"),
    label: "Member profile",
    icon: "user",
  },
  {
    matches: (pathname) => pathname.startsWith("/studio/pipeline"),
    label: "Status",
    icon: "columns",
  },
  {
    matches: (pathname) => pathname.startsWith("/studio/events"),
    label: "Events",
    icon: "calendar",
  },
  {
    matches: (pathname) => pathname.startsWith("/studio/copilot"),
    label: "Co-pilot",
    icon: "wand",
  },
  {
    matches: (pathname) => pathname.startsWith("/studio/team"),
    label: "Team",
    icon: "userCog",
  },
  {
    matches: (pathname) => pathname === "/studio",
    label: "Directory",
    icon: "users",
  },
];

export function StudioPortalHeader() {
  const pathname = usePathname();
  const current =
    PAGE_CONTEXT.find((entry) => entry.matches(pathname)) ??
    PAGE_CONTEXT[PAGE_CONTEXT.length - 1];

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
          href="/studio/matchmaking"
          className="inline-flex h-7 items-center gap-1.5 rounded border border-line bg-paper px-2.5 text-[12px] font-medium text-ink transition hover:border-ink/20 hover:bg-ink/[0.025]"
        >
          <PortalIcon name="sparkles" />
          New match
        </Link>
      </div>
    </header>
  );
}
