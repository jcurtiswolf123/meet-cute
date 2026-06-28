import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isConnectedTo, vouchesFor, mutualFriends } from "@/lib/social";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ConnectionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentPerson();
  if (!me) redirect("/login");

  // Guard: member can only view profiles of people they are connected to
  const canView = await isConnectedTo(me.id, id);
  if (!canView) notFound();

  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      photos: true,
      prompts: true,
    },
  });
  if (!person || person.isOperator) notFound();

  const [vouches, mutuals] = await Promise.all([
    vouchesFor(id),
    mutualFriends(me.id, id),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/app/connections" className="text-xs text-muted hover:text-ink">
        &larr; Back to connections
      </Link>

      <div className="mt-6 flex items-start gap-6">
        <Avatar url={person.photos[0]?.url} name={person.name} size={96} />
        <div className="flex-1">
          <h1 className="font-display text-4xl font-medium">{person.name.split(" ")[0]}</h1>
          <p className="mt-1 text-lg text-muted">
            {person.age} {person.age ? "." : ""} {person.neighborhood} {person.neighborhood && person.city ? "," : ""} {person.city}
          </p>
          {person.headline && (
            <p className="mt-2 font-display text-lg text-claret">{person.headline}</p>
          )}
        </div>
      </div>

      {person.bio && (
        <div className="mt-6">
          <p className="label">About</p>
          <p className="mt-2 text-sm leading-relaxed">{person.bio}</p>
        </div>
      )}

      {(person.lookingFor || person.dealBreakers) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {person.lookingFor && (
            <div>
              <p className="label">Looking for</p>
              <p className="mt-1 text-sm">{person.lookingFor}</p>
            </div>
          )}
          {person.dealBreakers && (
            <div>
              <p className="label">Deal-breakers</p>
              <p className="mt-1 text-sm">{person.dealBreakers}</p>
            </div>
          )}
        </div>
      )}

      {(person.recommendation || person.voucherName) && (
        <div className="mt-6 rounded-xl border border-sage/30 bg-sage/8 p-4">
          <p className="label text-sage">Recommendation</p>
          {person.recommendation && (
            <p className="mt-2 text-sm italic leading-relaxed text-ink/85">&ldquo;{person.recommendation}&rdquo;</p>
          )}
          {person.voucherName && (
            <p className="mt-2 text-xs text-muted">Vouched for by {person.voucherName}</p>
          )}
        </div>
      )}

      {vouches.length > 0 && (
        <div className="mt-6">
          <p className="label">
            {vouches.length} {vouches.length === 1 ? "person vouches" : "people vouch"} for {person.name.split(" ")[0]}
          </p>
          {vouches[0]?.note && (
            <p className="mt-2 border-l-2 border-sage pl-3 text-sm italic text-ink/80">&ldquo;{vouches[0].note}&rdquo;</p>
          )}
        </div>
      )}

      {mutuals.length > 0 && (
        <div className="mt-6">
          <p className="label">You both know</p>
          <p className="mt-1 text-sm text-muted">{mutuals.map((m) => m.name.split(" ")[0]).join(", ")}</p>
        </div>
      )}

      {person.prompts.length > 0 && (
        <div className="mt-6">
          <p className="label mb-3">Quick questions</p>
          <div className="space-y-4">
            {person.prompts.map((p) => (
              <div key={p.id}>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">{p.question}</p>
                <p className="mt-1.5 text-sm leading-relaxed">{p.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
