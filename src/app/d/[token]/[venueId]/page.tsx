// "We're going here" from the connection email.
//
// Reached from an inbox with no session, by either person, so authority comes
// entirely from the HMAC in the token. It records which venue the pair chose and
// says plainly that nothing is booked, because nothing is: Mutuals holds no
// tables and the operator does venue coordination by hand.
//
// A stale or tampered link renders the same calm branded page as a rotated
// invite rather than a 404, since the only audience arrives straight from email.
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { verifyDatePickToken } from "@/lib/date-pick";

export const dynamic = "force-dynamic";

export const metadata = { title: "Your pick | Mutuals" };

function Shell({ title, body }: { title: string; body: string }) {
  return (
    <main className="container-mc flex min-h-screen items-center py-12">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display text-3xl leading-tight">{title}</h1>
        <p className="mt-3 text-base leading-relaxed text-muted">{body}</p>
        <p className="mt-8 text-sm">
          <Link href="/app" className="underline underline-offset-4">
            Open Mutuals
          </Link>
        </p>
      </div>
    </main>
  );
}

export default async function DatePickPage({
  params,
}: {
  params: Promise<{ token: string; venueId: string }>;
}) {
  const { token, venueId } = await params;
  const matchId = verifyDatePickToken(decodeURIComponent(token));
  if (!matchId) {
    return (
      <Shell
        title="We couldn't find that link."
        body="It may have expired or been changed. Reply to your introduction email and a person will pick it up."
      />
    );
  }

  const [match, venue] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId }, select: { id: true, stage: true } }),
    prisma.venue.findUnique({ where: { id: decodeURIComponent(venueId) }, select: { id: true, name: true, area: true, bookingUrl: true } }),
  ]);

  if (!match || !venue) {
    return (
      <Shell
        title="We couldn't find that link."
        body="That introduction or place is no longer available. Reply to your introduction email and a person will pick it up."
      />
    );
  }

  // Tapping twice is a double-click, not a second decision, so the unique
  // constraint absorbs it and the page reads the same either way.
  await prisma.datePick
    .upsert({
      where: { matchId_venueId: { matchId: match.id, venueId: venue.id } },
      create: { matchId: match.id, venueId: venue.id },
      update: {},
    })
    .catch(() => null);

  return (
    <Shell
      title={`${venue.name} it is.`}
      body={
        `We've noted that you're heading to ${venue.name}${venue.area ? ` in ${venue.area}` : ""}. ` +
        `Nothing is reserved on your behalf, so book it yourself if it takes reservations. ` +
        `Reply to your introduction email if you would like a hand.`
      }
    />
  );
}
