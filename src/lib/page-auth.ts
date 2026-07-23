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
    redirect(person.appliedAt ? "/apply/thanks" : "/apply");
  }
  return person;
}

export async function requireOperatorPage() {
  const person = await getCurrentPerson();
  if (!person) redirect("/studio/login");
  if (!person.isOperator) redirect("/app");
  return person;
}
