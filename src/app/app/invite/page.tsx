import { getCurrentPerson } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Invite() {
  const me = (await getCurrentPerson())!;
  const invites = await prisma.referral.findMany({ where: { inviterId: me.id }, orderBy: { createdAt: "asc" } });
  const referred = await prisma.person.findMany({
    where: { referredById: me.id, isOperator: false },
    select: { id: true, name: true, status: true },
  });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-3xl font-medium">Invite singles you love</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Every member gets a handful of invites. The people you refer skip the queue with a lighter
        application. A referral is also a vouch, so refer well. Refer enough good people and you unlock
        priority matching and a dinner seat.
      </p>

      <div className="mt-8">
        <p className="label">Your invite codes</p>
        <div className="mt-3 space-y-2">
          {invites.map((inv) => (
            <div key={inv.id} className="card flex items-center justify-between p-4">
              <code className="font-mono text-sm tracking-wide">{inv.code}</code>
              <span className={`text-xs ${inv.status === "open" ? "text-sage" : "text-muted"}`}>
                {inv.status === "open" ? "Available" : inv.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {me.isAmbassador && (
        <div className="mt-8 rounded-lg border border-claret/25 bg-claret/5 p-5">
          <p className="font-display text-lg">Founding Ambassador</p>
          <p className="mt-1 text-sm text-muted">
            Free dinners (+1), first look at new singles, fast-track for your intros, and free coaching.
            Your goal: 5 to 10 vetted intros in 60 days.
          </p>
        </div>
      )}

      <div className="mt-8">
        <p className="label">People you brought in</p>
        {referred.length ? (
          <ul className="mt-3 space-y-1 text-sm">
            {referred.map((r) => (
              <li key={r.id} className="flex justify-between border-b border-line py-1.5">
                <span>{r.name}</span>
                <span className="text-muted">{r.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No one yet. Share a code above.</p>
        )}
      </div>
    </div>
  );
}
