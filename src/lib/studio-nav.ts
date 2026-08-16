import type { IconName } from "@/components/PortalSidebar";

// Where you are in the studio, given a pathname. Its own module because both
// the desktop header and the mobile bar name the current page, and importing
// one from the other made a cycle through PortalIcon.
//
// Order matters: the first match wins, and the Directory entry is last because
// it is the exact-match fallback for `/studio`.
export const STUDIO_PAGES: Array<{
  matches: (pathname: string) => boolean;
  label: string;
  icon: IconName;
}> = [
  {
    matches: (pathname) => pathname.startsWith("/studio/matchmaking"),
    label: "Introduce",
    icon: "sparkles",
  },
  {
    // Conversations and Status both redirect into Matches, but the transcript
    // at /studio/conversations/<id> is still its own page.
    matches: (pathname) => pathname.startsWith("/studio/conversations"),
    label: "Conversation",
    icon: "message",
  },
  {
    matches: (pathname) => pathname.startsWith("/studio/matches"),
    label: "Matches",
    icon: "heart",
  },
  {
    matches: (pathname) => pathname.startsWith("/studio/applicants"),
    label: "Applicants",
    icon: "user",
  },
  {
    matches: (pathname) => pathname.startsWith("/studio/person/"),
    label: "Member profile",
    icon: "user",
  },
  {
    matches: (pathname) => pathname.startsWith("/studio/delivery"),
    label: "Delivery",
    icon: "mail",
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

export function studioPage(pathname: string) {
  return STUDIO_PAGES.find((entry) => entry.matches(pathname)) ?? STUDIO_PAGES[STUDIO_PAGES.length - 1];
}
