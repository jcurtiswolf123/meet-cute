import Link from "next/link";
import { getCurrentPerson } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { connectedPersonIds } from "@/lib/social";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

// The only roster a member ever sees: people they have actually been connected
// to. Everyone else's profile is off-limits (enforced in [id]/page.tsx).
export default async function Connections() {
  const me = (await getCurrentPerson())!;
  const ids = await connectedPersonIds(me.id);
  const people = ids.length
    ? await prisma.person.findMany({
        where: { id: { in: ids } },
        include: { photos: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-medium">Your connections</h1>
      <p className="mt-1 text-sm text-muted">People you have been introduced to through Meet Cute.</p>

      {people.length === 0 ? (
        <div className="card mt-8 p-8 text-center text-sm text-muted">
          No connections yet. When you and someone both say yes to an introduction, they will show up
          here.
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {people.map((p) => (
            <Link
              key={p.id}
              href={`/app/connections/${p.id}`}
              className="card flex items-center gap-3 p-4 transition hover:border-claret/40"
            >
              <Avatar url={p.photos[0]?.url} name={p.name} size={48} />
              <span>
                <span className="block font-medium text-ink">{p.name.split(" ")[0]}</span>
                <span className="block text-xs text-muted">{p.neighborhood || p.city}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
