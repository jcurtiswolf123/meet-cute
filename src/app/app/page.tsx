import { getCurrentPerson } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decideMatch } from "@/lib/actions";
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

  const pending = matches.find((m) =>
    m.personAId === me.id ? m.aDecision === "pending" : m.bDecision === "pending"
  );

  if (!pending) {
    const waiting = matches.find((m) =>
      m.personAId === me.id ? m.aDecision === "yes" && m.bDecision === "pending" : m.bDecision === "yes" && m.aDecision === "pending"
    );
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="font-display text-6xl text-claret/30">♥</div>
        <h1 className="mt-4 font-display text-3xl font-medium">
          {waiting ? "You said yes. Sit tight." : "No new introductions right now."}
        </h1>
        <p className="mt-3 text-muted">
          {waiting
            ? "We let you know the moment it is mutual, and the concierge takes it from there."
            : "Your matchmaker is working on your next introduction. Quality over quantity, always."}
        </p>
      </div>
    );
  }

  const other = pending.personAId === me.id ? pending.personB : pending.personA;
  const iSaidYes = pending.personAId === me.id ? pending.aDecision === "yes" : pending.bDecision === "yes";
  const [mutuals, vouches] = await Promise.all([mutualFriends(me.id, other.id), vouchesFor(other.id)]);

  return (
    <div className="mx-auto max-w-2xl animate-fadeup">
      <p className="label mb-4 text-center">Your matchmaker thinks you should meet</p>

      <div className="card overflow-hidden">
        <div className="grid sm:grid-cols-[200px_1fr]">
          <div className="bg-paper">
            <Avatar url={other.photos[0]?.url} name={other.name} size={200} />
          </div>
          <div className="p-6">
            <div className="flex items-baseline justify-between">
              <h1 className="font-display text-3xl font-medium">{other.name.split(" ")[0]}, {other.age}</h1>
              <span className="text-sm text-muted">{other.neighborhood}</span>
            </div>
            <p className="mt-1 text-claret">{other.headline}</p>
            <p className="mt-4 text-sm leading-relaxed text-ink/90">{other.bio}</p>

            {(mutuals.length > 0 || vouches.length > 0) && (
              <div className="mt-5 rounded-lg border border-sage/30 bg-sage/10 p-4">
                {vouches.length > 0 && (
                  <p className="text-sm font-medium text-ink">
                    {vouches.length} {vouches.length === 1 ? "person vouches" : "people vouch"} for {other.name.split(" ")[0]}
                  </p>
                )}
                {mutuals.length > 0 && (
                  <p className="mt-1 text-sm text-muted">
                    You both know {mutuals.map((m) => m.name.split(" ")[0]).join(", ")}.
                  </p>
                )}
                {vouches[0]?.note && (
                  <p className="mt-2 text-sm italic text-ink/80">&ldquo;{vouches[0].note}&rdquo; - {vouches[0].voucher.name.split(" ")[0]}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-line p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {other.prompts.map((p) => (
              <div key={p.id}>
                <p className="label">{p.question}</p>
                <p className="mt-1 text-sm">{p.answer}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Detail label="Looking for" value={other.lookingFor} />
            <Detail label="Deal-breakers" value={other.dealBreakers} />
          </div>
        </div>

        {pending.rationale && (
          <div className="border-t border-line bg-cream/60 p-6">
            <p className="label">Why your matchmaker picked this</p>
            <p className="mt-1 text-sm italic leading-relaxed text-ink/85">{pending.rationale}</p>
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-line p-6">
          {iSaidYes ? (
            <p className="text-sm text-muted">You said yes. Waiting on {other.name.split(" ")[0]}.</p>
          ) : (
            <>
              <form action={decideMatch.bind(null, pending.id, "yes")} className="flex-1">
                <SubmitButton className="btn-primary w-full py-3" pendingText="Introducing...">Yes, introduce us</SubmitButton>
              </form>
              <form action={decideMatch.bind(null, pending.id, "pass")}>
                <SubmitButton className="btn-ghost px-6 py-3" pendingText="...">Not this time</SubmitButton>
              </form>
            </>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-muted">
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
