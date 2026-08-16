import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Merged into `/studio/events?view=venues` on 2026-08-16. The route stays as a
// redirect because `venue-actions.ts` revalidates it, `scripts/suggest-venues.ts`
// prints it as where to review proposals, and the docs point here.
export default function VenuesRedirect() {
  redirect("/studio/events?view=venues");
}
