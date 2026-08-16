import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Merged into `/studio/matches?view=live` on 2026-08-16. The route stays as a
// redirect because `actions.ts` redirects here after a bulk resend or close,
// the co-pilot links here, and the docs and operator bookmarks point here.
// The transcript at `/studio/conversations/[id]` is untouched and is still the
// canonical place to read one thread.
export default async function ConversationsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ resent?: string; closed?: string }>;
}) {
  const sp = await searchParams;
  const query = new URLSearchParams();
  if (sp.resent !== undefined) query.set("resent", sp.resent);
  if (sp.closed !== undefined) query.set("closed", sp.closed);
  const suffix = query.toString();
  redirect(suffix ? `/studio/matches?${suffix}` : "/studio/matches");
}
