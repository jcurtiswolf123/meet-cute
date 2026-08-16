import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Merged into `/studio/matches?view=board` on 2026-08-16. It was labelled
// "Status" in the rail and was a fourth way to look at the same object. The
// route stays as a redirect because `actions.ts` revalidates and redirects
// here, and the printed quick-start names it.
export default function PipelineRedirect() {
  redirect("/studio/matches?view=board");
}
