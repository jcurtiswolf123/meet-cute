import { redirect } from "next/navigation";
import { getCurrentPerson } from "./auth";

// Protected pages must check authorization themselves. Next.js can render a
// page in parallel with its layout, so a layout redirect alone does not prevent
// the page from running database queries or dereferencing a missing user.
export async function requireMemberPage() {
  const person = await getCurrentPerson();
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
  const person = await getCurrentPerson();
  if (!person) redirect("/studio/login");
  if (!person.isOperator) redirect("/app");
  return person;
}
