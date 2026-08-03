import { requireMemberPage } from "@/lib/page-auth";
import { prisma } from "@/lib/prisma";
import { updateProfile } from "@/lib/actions";
import { Avatar } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { PhotoManager } from "./PhotoManager";

export const dynamic = "force-dynamic";

// A member whose friends wrote their recommendations does not get those three
// fields rendered at all, so they arrive here as null. Passing "" for a field
// the form never showed would erase the recommendation a friend wrote, which is
// why absent has to stay absent rather than becoming empty.
function optional(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return value === null ? undefined : String(value);
}

async function save(formData: FormData) {
  "use server";
  await updateProfile({
    headline: String(formData.get("headline") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    lookingFor: String(formData.get("lookingFor") ?? ""),
    dealBreakers: String(formData.get("dealBreakers") ?? ""),
    recommendation: optional(formData, "recommendation"),
    voucherName: optional(formData, "voucherName"),
    voucherContact: optional(formData, "voucherContact"),
  });
}

export default async function Profile() {
  const me = await requireMemberPage();
  const recommendations = await prisma.recommendation.findMany({
    where: { applicantId: me.id, status: "submitted" },
    orderBy: { submittedAt: "asc" },
    select: { id: true, name: true, body: true, relationship: true },
  });
  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-4">
        <Avatar url={me.photos[0]?.url} name={me.name} size={64} />
        <div>
          <h1 className="font-display text-3xl font-medium">{me.name}</h1>
          <p className="text-sm text-muted">{me.city} · {me.neighborhood}</p>
        </div>
      </div>

      <div className="mt-8">
        <PhotoManager photos={me.photos.map((p) => ({ id: p.id, url: p.url, status: p.status }))} />
      </div>

      <form action={save} className="mt-8 space-y-5">
        <div>
          <label className="label" htmlFor="headline">Headline</label>
          <input id="headline" name="headline" defaultValue={me.headline ?? ""} className="field mt-1.5" />
        </div>
        <div>
          <label className="label" htmlFor="bio">About you</label>
          <textarea id="bio" name="bio" defaultValue={me.bio ?? ""} className="field mt-1.5 min-h-32" />
        </div>
        <div>
          <label className="label" htmlFor="lookingFor">What you are looking for</label>
          <textarea id="lookingFor" name="lookingFor" defaultValue={me.lookingFor ?? ""} className="field mt-1.5 min-h-24" />
        </div>
        <div>
          <label className="label" htmlFor="dealBreakers">Deal-breakers</label>
          <input id="dealBreakers" name="dealBreakers" defaultValue={me.dealBreakers ?? ""} className="field mt-1.5" />
        </div>

        {/* What your friends wrote about you. Read-only on purpose: these are
            their words, shown to the people you are introduced to, and a member
            editing them would make the whole gate worth nothing. The editable
            fields below it are the older self-reported line, kept for members
            who joined before the recommendation gate. */}
        {recommendations.length > 0 ? (
          <fieldset className="space-y-4 rounded-xl border border-line bg-paper/40 p-4">
            <legend className="label px-1">What your friends said</legend>
            <p className="-mt-1 text-xs text-muted">
              Their words, in full, on the introduction we send about you. Only you and the one
              person we introduce you to ever see them.
            </p>
            {recommendations.map((rec) => (
              <div key={rec.id}>
                <p className="border-l-2 border-claret pl-3 font-display text-base italic leading-relaxed text-ink">
                  &ldquo;{rec.body}&rdquo;
                </p>
                <p className="mt-1.5 pl-3 text-xs text-muted">
                  {rec.name}
                  {rec.relationship ? ` · ${rec.relationship}` : ""}
                </p>
              </div>
            ))}
          </fieldset>
        ) : (
          <fieldset className="space-y-4 rounded-xl border border-line bg-paper/40 p-4">
            <legend className="label px-1">Your recommendation</legend>
            {me.recommendation && (
              <p className="-mt-1 border-l-2 border-sage pl-3 text-sm italic text-ink/80">&ldquo;{me.recommendation}&rdquo;</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="voucherName">Who vouches for you?</label>
                <input id="voucherName" name="voucherName" defaultValue={me.voucherName ?? ""} className="field mt-1.5" placeholder="Their full name" />
              </div>
              <div>
                <label className="label" htmlFor="voucherContact">How we reach them</label>
                <input id="voucherContact" name="voucherContact" defaultValue={me.voucherContact ?? ""} className="field mt-1.5" placeholder="Their email or phone" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="recommendation">In their words</label>
              <textarea id="recommendation" name="recommendation" defaultValue={me.recommendation ?? ""} className="field mt-1.5 min-h-24" placeholder="A line about you, from someone who knows you well." />
            </div>
          </fieldset>
        )}

        <div className="space-y-3">
          {me.prompts.map((p) => (
            <div key={p.id}>
              <label className="label">{p.question}</label>
              <p className="field mt-1.5 bg-paper/60">{p.answer}</p>
            </div>
          ))}
        </div>

        <SubmitButton className="btn-primary w-full py-3" pendingText="Saving...">Save profile</SubmitButton>
      </form>
    </div>
  );
}
