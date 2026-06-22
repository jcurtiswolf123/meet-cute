import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

export default async function Dinners() {
  const dinners = await prisma.dinner.findMany({
    include: { _count: { select: { attendees: true } } },
    orderBy: { date: "asc" },
  });
  const upcoming = dinners.filter((d) => d.status !== "done");
  const past = dinners.filter((d) => d.status === "done");

  return (
    <>
      <SiteHeader />
      <main className="container-mc min-h-screen py-12">
      <div className="max-w-[58ch]">
        <p className="label mb-3">Meet Cute Dinners</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">Twelve people, one long table.</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">
          Monthly curated dinners in NYC and SF. Half the fun is who is in the room. Standalone, and
          the most natural way onto the roster.
        </p>
      </div>

      <h2 className="label mt-12">Upcoming</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {upcoming.map((d) => (
          <div key={d.id} className="card p-6">
            <div className="flex items-center justify-between">
              <span className="pill">{d.city}</span>
              <span className="text-xs text-muted">{d._count.attendees}/{d.capacity} seats</span>
            </div>
            <h3 className="mt-4 font-display text-2xl font-medium">{d.theme}</h3>
            <p className="mt-1 text-sm text-muted">
              {d.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · {d.venue}
            </p>
            <Link href="/apply" className="btn-ghost mt-5">Request a seat</Link>
          </div>
        ))}
        {!upcoming.length && <p className="text-sm text-muted">Next dates announced soon.</p>}
      </div>

      <h2 className="label mt-12">Past</h2>
      <ul className="mt-4 space-y-2 text-sm text-muted">
        {past.map((d) => (
          <li key={d.id} className="flex items-center justify-between border-b border-line pb-2">
            <span>{d.theme} · {d.city}</span>
            <span>{d.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
          </li>
        ))}
      </ul>
      </main>
      <SiteFooter />
    </>
  );
}
