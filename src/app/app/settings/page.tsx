import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentPerson } from "@/lib/auth";
import { unblockPerson } from "@/lib/actions";
import { DeleteAccount } from "./DeleteAccount";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const me = (await getCurrentPerson())!;
  const blocks = await prisma.block.findMany({
    where: { blockerId: me.id },
    include: { blocked: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-xl space-y-10">
      <div>
        <h1 className="font-display text-3xl font-medium">Settings</h1>
        <p className="mt-1 text-sm text-muted">Signed in as {me.email}.</p>
      </div>

      <section>
        <h2 className="label">Your data</h2>
        <p className="mt-2 text-sm text-muted">
          Download everything we hold about you, or read how we handle it.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <a href="/api/me/export" className="btn-ghost">
            Download my data (JSON)
          </a>
          <Link href="/privacy" className="btn-ghost">
            Privacy Policy
          </Link>
          <Link href="/terms" className="btn-ghost">
            Terms
          </Link>
        </div>
      </section>

      <section>
        <h2 className="label">Blocked members</h2>
        {blocks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">You have not blocked anyone.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-xl border border-line px-4 py-2.5 text-sm">
                <span>{b.blocked.name}</span>
                <form action={unblockPerson}>
                  <input type="hidden" name="subjectId" value={b.blocked.id} />
                  <button className="text-xs text-claret underline">Unblock</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-claret/30 bg-claret/5 p-5">
        <h2 className="label text-claret">Danger zone</h2>
        <p className="mt-2 text-sm text-muted">
          Deleting your account removes your profile, photos, matches, messages, vouches, and
          referrals. This cannot be undone.
        </p>
        <DeleteAccount />
      </section>
    </div>
  );
}
