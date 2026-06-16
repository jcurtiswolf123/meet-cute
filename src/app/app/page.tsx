import { getCurrentPerson } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decideMatch, blockedIdsFor } from "@/lib/actions";
import { mutualFriends, vouchesFor } from "@/lib/social";
import { Avatar } from "@/components/ui";
import { SubmitButton } from "@/components/forms";

export const dynamic = "force-dynamic";

export default async function ForYou() {
  const me = (await getCurrentPerson())!;

  // current suggestion = oldest open match where I haven't decided yet
  const matches = await prisma.match.findMany({
    where: {
      stage: { in: ["suggested", "mutual_yes"] },
      OR: [{ personAId: me.id }, { personBId: me.id }],
    },
    include: {
      personA: { include: { photos: true, prompts: true } },
      personB: { include: { photos: true, prompts: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Never surface a match with someone in a block relationship (either way).
  const blocked = new Set(await blockedIdsFor(me.id));
  const visible = matches.filter((m) => !blocked.has(m.personAId === me.id ? m.personBId : m.personAId));

  const pending = visible.find((m) =>
    m.personAId === me.id ? m.aDecision === "pending" : m.bDecision === "pending"
  );

  if (!pending) {
    const waiting = visible.find((m) =>
      m.personAId === me.id ? m.aDecision === "yes" && m.bDecision === "pending" : m.bDecision === "yes" && m.aDecision === "pending"
    );
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <div className="font-display text-6xl font-light text-claret/20">♥</div>
        <h1 className="mt-8 font-display text-4xl font-medium">
          {waiting ? "You said yes." : "No new introductions yet."}
        </h1>
        <p className="mt-4 max-w-sm text-lg leading-relaxed text-muted">
          {waiting
            ? "Waiting on the other person to say yes. We'll let you know the moment it is mutual, and the concierge takes it from there."
            : "Your matchmaker is working on your next introduction. We'd rather take our time and get it right. Quality over quantity, always."}
        </p>
      </div>
    );
  }

  const other = pending.personAId === me.id ? pending.personB : pending.personA;
  const iSaidYes = pending.personAId === me.id ? pending.aDecision === "yes" : pending.bDecision === "yes";
  const [mutuals, vouches] = await Promise.all([mutualFriends(me.id, other.id), vouchesFor(other.id)]);

  return (
    <div className="mx-auto max-w-2xl animate-fadeup px-4 py-8">
      <p className="label mb-8 text-center">Your matchmaker thinks you should meet</p>

      <div className="card overflow-hidden">
        {/* hero photo section */}
        <div className="relative h-64 bg-paper sm:h-80">
          {other.photos[0]?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={other.photos[0].url}
              alt={other.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Avatar url={other.photos[0]?.url} name={other.name} size={120} />
            </div>
          )}
        </div>

        {/* header: name, age, location */}
        <div className="border-b border-line px-6 py-6 sm:px-8">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-medium">{other.name.split(" ")[0]}</h1>
              <p className="mt-1 text-lg text-muted">{other.age} · {other.neighborhood}</p>
            </div>
          </div>
          <p className="mt-3 text-lg leading-relaxed text-ink/90">{other.bio}</p>
          {other.headline && (
            <p className="mt-2 font-display text-lg text-claret">{other.headline}</p>
          )}
        </div>

        {/* vouching / mutual friends */}
        {(mutuals.length > 0 || vouches.length > 0) && (
          <div className="border-b border-line bg-sage/8 px-6 py-6 sm:px-8">
            <div className="space-y-3">
              {vouches.length > 0 && (
                <div>
                  <p className="font-medium text-ink">
                    {vouches.length} {vouches.length === 1 ? "person vouches" : "people vouch"} for {other.name.split(" ")[0]}
                  </p>
                  {vouches[0]?.note && (
                    <p className="mt-2 border-l-2 border-sage pl-3 italic text-ink/80">&ldquo;{vouches[0].note}&rdquo;</p>
                  )}
                </div>
              )}
              {mutuals.length > 0 && (
                <p className="text-sm text-muted">
                  You both know {mutuals.map((m) => m.name.split(" ")[0]).join(", ")}.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Q&A and details */}
        <div className="border-b border-line px-6 py-6 sm:px-8">
          <p className="label mb-4">A bit more about {other.name.split(" ")[0]}</p>
          <div className="space-y-4">
            {other.prompts.map((p) => (
              <div key={p.id}>
                <p className="text-xs font-medium uppercase tracking-wider text-muted">{p.question}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink/90">{p.answer}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-4">
            <Detail label="Looking for" value={other.lookingFor} />
            <Detail label="Deal-breakers" value={other.dealBreakers} />
          </div>
        </div>

        {/* matchmaker's note */}
        {pending.rationale && (
          <div className="border-b border-line bg-cream/40 px-6 py-6 sm:px-8">
            <p className="label mb-3">Why this introduction</p>
            <p className="text-sm italic leading-relaxed text-ink/85">{pending.rationale}</p>
          </div>
        )}

        {/* decision section */}
        <div className="px-6 py-6 sm:px-8">
          {iSaidYes ? (
            <div className="rounded-lg border border-sage/30 bg-sage/5 p-4 text-center">
              <p className="font-medium text-sage">You said yes.</p>
              <p className="mt-1 text-sm text-muted">Waiting on {other.name.split(" ")[0]}'s response.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <form action={decideMatch.bind(null, pending.id, "yes")}>
                <SubmitButton className="btn-primary w-full py-3" pendingText="Introducing...">Yes, introduce us</SubmitButton>
              </form>
              <form action={decideMatch.bind(null, pending.id, "pass")}>
                <SubmitButton className="btn-ghost w-full py-3" pendingText="...">Pass</SubmitButton>
              </form>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-muted">
        One introduction at a time. No swiping. If you both say yes, the concierge books the first date.
      </p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="label">{label}</p>
      <p className="mt-1 text-sm">{value}</p>
    </div>
  );
}
