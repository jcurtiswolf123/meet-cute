import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Avatar, Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Coaching() {
  const coaches = await prisma.person.findMany({ where: { isCoach: true }, orderBy: { name: "asc" } });
  return (
    <main className="container-mc min-h-screen py-12">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/apply" className="btn-primary">Apply</Link>
      </header>

      <div className="mt-10 max-w-[58ch]">
        <p className="label mb-3">Coaching</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">
          We helped you meet. Now we help you build it.
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          A small bench of hand-picked coaches. Dating coaching for people on the roster: profile help,
          date prep, post-date debriefs. Couples coaching for the pairs who met through us, and the ones
          who found each other elsewhere.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {coaches.map((c) => (
          <div key={c.id} className="card flex items-center gap-4 p-5">
            <Avatar name={c.name} size={52} />
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-muted">{c.coachBio ?? "Coach"}</div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
