import { revalidatePath } from "next/cache";
import { getSessionPersonId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(path: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      "Cache-Control": "no-store",
      Location: path,
    },
  });
}

export async function POST(request: Request) {
  const personId = await getSessionPersonId();
  if (!personId) return redirectTo("/login");

  const person = await prisma.person.findUnique({
    where: { id: personId },
    select: { appliedAt: true, isOperator: true, status: true },
  });
  if (!person || person.status === "exited") return redirectTo("/login");
  if (person.isOperator) return redirectTo("/studio");
  if (person.status === "applicant") {
    return redirectTo(person.appliedAt ? "/apply/thanks" : "/apply");
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 1_024) {
    return new Response("Request too large.", { status: 413 });
  }
  let rawOn: string;
  try {
    const formData = await request.formData();
    rawOn = String(formData.get("on") || "");
  } catch {
    return new Response("Bad request.", { status: 400 });
  }
  if (rawOn !== "0" && rawOn !== "1") {
    return new Response("Bad request.", { status: 400 });
  }
  const on = rawOn === "1";
  await prisma.person.update({
    where: { id: personId },
    data: { openToMatch: on, optedInAt: on ? new Date() : null },
  });
  revalidatePath("/app");
  return redirectTo("/app");
}
