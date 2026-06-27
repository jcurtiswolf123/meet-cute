import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { OperatorLoginPanel } from "@/components/OperatorLoginPanel";

export const dynamic = "force-dynamic";

export default async function StudioLogin({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const me = await getCurrentPerson();
  if (me?.isOperator) redirect("/studio");

  const sp = await searchParams;

  return (
    <main className="container-mc flex min-h-screen items-center py-12">
      <OperatorLoginPanel
        sent={sp.sent === "1"}
        expired={sp.error === "expired"}
        notOperator={sp.error === "not-operator"}
      />
    </main>
  );
}
