import { cache } from "react";
import { redirect } from "next/navigation";
import { getCurrentPerson, getSessionSubject } from "./auth";

// Protected pages must check authorization themselves. Next.js can render a
// page in parallel with its layout, so a layout redirect alone does not prevent
// the page from running database queries or dereferencing a missing user.
//
// That parallelism is also why both of these are cached. A studio page and the
// studio layout each call requireOperatorPage, and until this cache existed
// that was two independent trips to a database in another AWS region before
// either could render a pixel. The cache is per-request, so it cannot leak one
// visitor's session into another's page.

/** The member's own row with the relations `/app` renders. Cached because the
 *  member layout and the member page both need it and neither writes to it. */
const currentPersonForPage = cache(getCurrentPerson);

export async function requireMemberPage() {
  const person = await currentPersonForPage();
  if (!person) redirect("/login");
  if (person.isOperator) redirect("/studio");
  if (person.status === "exited") redirect("/login");
  if (person.status === "applicant") {
    // Three states now, not two: nothing saved, the first half saved, and the
    // whole thing submitted. Sending someone who saved their details back to
    // the start would ask them to do it twice.
    if (person.appliedAt) redirect("/apply/thanks");
    redirect(person.basicsAt ? "/apply/friends" : "/apply");
  }
  return person;
}

export async function requireOperatorPage() {
  // getSessionSubject is already cached and already one round trip: the studio
  // never renders the operator's own photos or prompts, so it never reads them.
  const person = await getSessionSubject();
  if (!person) redirect("/studio/login");
  if (!person.isOperator) redirect("/app");
  return person;
}
