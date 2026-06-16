import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOperator } from "@/lib/auth";
import { approvePhoto, rejectPhoto, resolveReport } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function Moderation() {
  const op = await requireOperator();
  if (!op) redirect("/login");

  const pending = await prisma.photo.findMany({
    where: { status: "pending" },
    include: { person: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
  });
  const reports = await prisma.report.findMany({
    where: { status: "open" },
    include: {
      reporter: { select: { name: true } },
      subject: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-4xl space-y-12">
      <div>
        <h1 className="font-display text-3xl font-medium">Moderation</h1>
        <p className="mt-1 text-sm text-muted">
          {pending.length} photo{pending.length === 1 ? "" : "s"} awaiting review ·{" "}
          {reports.length} open report{reports.length === 1 ? "" : "s"}.
        </p>
      </div>

      <section>
        <h2 className="label">Pending photos</h2>
        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Nothing in the queue.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((p) => (
              <div key={p.id} className="card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="aspect-square w-full object-cover" />
                <div className="flex items-center justify-between p-3">
                  <Link href={`/studio/person/${p.person.id}`} className="text-sm font-medium hover:underline">
                    {p.person.name}
                  </Link>
                  <div className="flex gap-2">
                    <form action={approvePhoto}>
                      <input type="hidden" name="photoId" value={p.id} />
                      <button className="rounded-full bg-claret px-3 py-1 text-xs font-medium text-white">Approve</button>
                    </form>
                    <form action={rejectPhoto}>
                      <input type="hidden" name="photoId" value={p.id} />
                      <button className="rounded-full border border-line px-3 py-1 text-xs">Reject</button>
                    </form>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="label">Open reports</h2>
        {reports.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No open reports.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="text-sm">
                    <p>
                      <Link href={`/studio/person/${r.subject.id}`} className="font-medium hover:underline">
                        {r.subject.name}
                      </Link>{" "}
                      <span className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted">{r.reason}</span>
                    </p>
                    <p className="mt-1 text-muted">Reported by {r.reporter.name}</p>
                    {r.detail && <p className="mt-2 text-ink">{r.detail}</p>}
                  </div>
                  <div className="flex gap-2">
                    {(["actioned", "dismissed"] as const).map((s) => (
                      <form key={s} action={resolveReport}>
                        <input type="hidden" name="reportId" value={r.id} />
                        <input type="hidden" name="status" value={s} />
                        <button className="rounded-full border border-line px-3 py-1 text-xs capitalize">{s}</button>
                      </form>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
