"use client";

import { useRouter } from "next/navigation";
import { studioNavigationDepth } from "@/components/StudioScrollMemory";

/**
 * Back to wherever they actually came from.
 *
 * The profile's back link was a hard link to the Directory, so an operator who
 * reached a profile from Status, Matchmaking or the applicant board was sent
 * somewhere else entirely, at the top of it. A real Back keeps the page, the
 * filters and the scroll position; the href stays as the fallback for a profile
 * opened cold in a new tab.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (studioNavigationDepth() > 1 && window.history.length > 1) router.back();
        else router.push(href);
      }}
      className="text-xs text-muted transition hover:text-ink"
    >
      &larr; {label}
    </button>
  );
}
