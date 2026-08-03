import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { approvePhoto, rejectPhoto } from "@/lib/actions";
import { STORED_EXT } from "@/lib/uploads";

export const dynamic = "force-dynamic";
export const metadata = { title: "Photo moderation" };

// The queue that was missing.
//
// `src/app/api/photos/route.ts` creates every upload with status "pending", and
// every surface that shows a photo filters on "approved". `approvePhoto` and
// `rejectPhoto` have existed since launch and both revalidate
// "/studio/moderation", a route that was never built. So the only way to
// approve a photo was to type "approve photos for <name>" at the co-pilot, and
// in practice nobody did: photos sat pending forever, and the invitation email
// and the invite page both fell back to an initials avatar. That is why photos
// looked missing before a member decided, not any gap in the photo plumbing.
//
// Operators can see pending images: /api/photos/[file] serves a non-approved
// photo to the owner or an operator, and refuses everyone else.
export default async function Moderation() {
  await requireOperatorPage();

  const [pending, recent] = await Promise.all([
    prisma.photo.findMany({
      where: { status: "pending" },
      include: { person: { select: { id: true, name: true, city: true, status: true } } },
      // Photo carries no timestamps, so group a person's uploads together and
      // keep their own ordering within that. Adding createdAt would mean a
      // migration on a table that does not otherwise need one.
      orderBy: [{ personId: "asc" }, { order: "asc" }],
    }),
    prisma.photo.findMany({
      where: { status: { in: ["approved", "rejected"] } },
      include: { person: { select: { id: true, name: true } } },
      orderBy: { id: "desc" },
      take: 12,
    }),
  ]);

  const src = (id: string) => `/api/photos/${id}.${STORED_EXT}`;

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-sans tracking-[-0.012em] text-2xl font-medium">Photo moderation</h1>
        <p className="mt-1 text-sm text-muted">
          Uploads wait here before anyone sees them. Until a photo is approved, a member&rsquo;s
          introduction goes out with initials instead of their face.
        </p>
      </div>

      {pending.length === 0 ? (
        <p className="rounded-xl2 border border-line bg-panel px-5 py-8 text-sm text-muted">
          Nothing waiting. Every uploaded photo has been reviewed.
        </p>
      ) : (
        <>
          <p className="label !text-ink">Waiting ({pending.length})</p>
          <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((photo) => (
              <li key={photo.id} className="card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- session-gated
                    route, not a static asset; next/image cannot carry the cookie */}
                <img
                  src={src(photo.id)}
                  alt={`Pending photo from ${photo.person.name}`}
                  className="aspect-[4/5] w-full bg-studio-subtle object-cover"
                />
                <div className="p-4">
                  <Link
                    href={`/studio/person/${photo.person.id}`}
                    className="block text-sm font-medium text-ink hover:underline"
                  >
                    {photo.person.name}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {photo.person.city} · {photo.person.status} · photo {photo.order + 1}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <form action={approvePhoto}>
                      <input type="hidden" name="photoId" value={photo.id} />
                      <button className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-ink/85">
                        Approve
                      </button>
                    </form>
                    <form action={rejectPhoto}>
                      <input type="hidden" name="photoId" value={photo.id} />
                      <button className="rounded-full border border-line px-3.5 py-1.5 text-xs transition hover:border-ink">
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {recent.length > 0 && (
        <section className="mt-10">
          <p className="label">Recently reviewed</p>
          <ul className="mt-3 divide-y divide-line border-t border-line text-sm">
            {recent.map((photo) => (
              <li key={photo.id} className="flex items-center justify-between py-2.5">
                <Link href={`/studio/person/${photo.person.id}`} className="text-ink hover:underline">
                  {photo.person.name}
                </Link>
                <span className="text-xs text-muted">{photo.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
