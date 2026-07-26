import { redirect } from "next/navigation";

// Retired member surface. Matching is operator-led and email-first, so
// members only see Home, Connections, Profile, and Settings. Any old link or
// bookmark lands them back on their home.
export const dynamic = "force-dynamic";

export default function RetiredMemberRoute() {
  redirect("/app");
}
