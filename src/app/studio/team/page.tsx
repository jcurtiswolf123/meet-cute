import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOperator } from "@/lib/auth";
import { addOperator, removeOperator } from "@/lib/actions";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

// Operator (admin) management. Each operator logs in with their own email via
// the same magic-link flow as members; the isOperator flag is what unlocks the
// studio. Here a current operator can add or revoke others self-serve.
export default async function Team() {
  const me = await requireOperator();
  if (!me) redirect("/login");

  const operators = await prisma.person.findMany({
    where: { isOperator: true },
    orderBy: { name: "asc" },
    include: { photos: { where: { status: "approved" }, take: 1 } },
  });

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="font-display text-3xl font-medium">Team</h1>
        <p className="mt-1 text-sm text-muted">
          Operators have full studio access: roster, pipeline, moderation, and the co-pilot. Everyone
          signs in with their own email — there is no shared password. Adding someone emails them a
          one-time sign-in link.
        </p>
      </div>

      <section className="card p-6">
        <h2 className="label">Add an operator</h2>
        <form action={addOperator} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              name="email"
              type="email"
              required
              placeholder="name@email.com"
              autoComplete="off"
              className="field sm:col-span-2"
            />
            <select name="city" className="field" defaultValue="NYC" aria-label="City">
              <option value="NYC">NYC</option>
              <option value="San Francisco">SF</option>
            </select>
          </div>
          <button type="submit" className="btn-primary whitespace-nowrap">
            Add &amp; invite
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          If they already have a member account, this promotes it to operator.
        </p>
      </section>

      <section>
        <h2 className="label">Operators ({operators.length})</h2>
        <ul className="mt-4 space-y-2">
          {operators.map((o) => {
            const isMe = o.id === me.id;
            const canRemove = !isMe && operators.length > 1;
            return (
              <li key={o.id} className="card flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-3">
                  <Avatar url={o.photos[0]?.url} name={o.name} size={40} />
                  <div>
                    <p className="text-sm font-medium">
                      {o.name}
                      {isMe && <span className="ml-2 text-xs text-muted">(you)</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {o.email} · {o.city}
                    </p>
                  </div>
                </div>
                {canRemove ? (
                  <form action={removeOperator}>
                    <input type="hidden" name="personId" value={o.id} />
                    <button className="rounded-full border border-line px-3 py-1 text-xs hover:border-claret/40 hover:text-claret">
                      Revoke access
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-muted">{isMe ? "—" : "last operator"}</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
