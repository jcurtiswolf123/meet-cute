import { getCurrentPerson } from "@/lib/auth";
import { updateProfile } from "@/lib/actions";
import { Avatar } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { PhotoManager } from "./PhotoManager";

export const dynamic = "force-dynamic";

async function save(formData: FormData) {
  "use server";
  await updateProfile({
    headline: String(formData.get("headline") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    lookingFor: String(formData.get("lookingFor") ?? ""),
    dealBreakers: String(formData.get("dealBreakers") ?? ""),
  });
}

export default async function Profile() {
  const me = (await getCurrentPerson())!;
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
          <label className="label">Headline</label>
          <input name="headline" defaultValue={me.headline ?? ""} className="field mt-1.5" />
        </div>
        <div>
          <label className="label">About you</label>
          <textarea name="bio" defaultValue={me.bio ?? ""} className="field mt-1.5 min-h-32" />
        </div>
        <div>
          <label className="label">What you are looking for</label>
          <textarea name="lookingFor" defaultValue={me.lookingFor ?? ""} className="field mt-1.5 min-h-24" />
        </div>
        <div>
          <label className="label">Deal-breakers</label>
          <input name="dealBreakers" defaultValue={me.dealBreakers ?? ""} className="field mt-1.5" />
        </div>

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
