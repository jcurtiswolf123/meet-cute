import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

async function main() {
  if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
  const [{ prisma }, { setDinnerAttendeeStatus }] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/events"),
  ]);
  const runId = randomUUID();
  const people: Array<{ id: string }> = [];
  let dinner: { id: string } | null = null;

  try {
    for (const suffix of ["A", "B"]) {
      people.push(
        await prisma.person.create({
          data: {
            name: `Capacity QA ${suffix}`,
            email: `capacity-${runId}-${suffix.toLowerCase()}@example.invalid`,
            city: "NYC",
            status: "active",
          },
          select: { id: true },
        }),
      );
    }
    dinner = await prisma.dinner.create({
      data: {
        city: "NYC",
        date: new Date(Date.now() + 86_400_000),
        venue: `Capacity QA ${runId}`,
        capacity: 1,
        status: "open",
      },
      select: { id: true },
    });
    const attendees = await Promise.all(
      people.map((person) =>
        prisma.dinnerAttendee.create({
          data: { dinnerId: dinner!.id, personId: person.id, status: "invited" },
        }),
      ),
    );
    const results = await Promise.allSettled(
      attendees.map((attendee) => setDinnerAttendeeStatus(attendee.id, "confirmed")),
    );
    if (results.filter((result) => result.status === "fulfilled").length !== 1) {
      console.error(
        results.map((result) =>
          result.status === "rejected"
            ? {
                name: result.reason instanceof Error ? result.reason.name : "Error",
                message: result.reason instanceof Error ? result.reason.message : String(result.reason),
                code:
                  typeof result.reason === "object" && result.reason && "code" in result.reason
                    ? String((result.reason as { code: unknown }).code)
                    : null,
              }
            : { status: "fulfilled" },
        ),
      );
    }
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(
      await prisma.dinnerAttendee.count({
        where: { dinnerId: dinner.id, status: { in: ["confirmed", "attended"] } },
      }),
      1,
    );
    assert.equal((await prisma.dinner.findUniqueOrThrow({ where: { id: dinner.id } })).status, "full");

    const confirmed = await prisma.dinnerAttendee.findFirstOrThrow({
      where: { dinnerId: dinner.id, status: "confirmed" },
    });
    const waiting = attendees.find((attendee) => attendee.id !== confirmed.id);
    assert.ok(waiting);
    await setDinnerAttendeeStatus(confirmed.id, "declined");
    await setDinnerAttendeeStatus(waiting.id, "confirmed");
    assert.equal(
      await prisma.dinnerAttendee.count({
        where: { dinnerId: dinner.id, status: { in: ["confirmed", "attended"] } },
      }),
      1,
    );
  } finally {
    if (dinner) await prisma.dinner.delete({ where: { id: dinner.id } }).catch(() => {});
    await prisma.person.deleteMany({
      where: { email: { startsWith: `capacity-${runId}-` } },
    });
    await prisma.$disconnect();
  }

  console.log("dinner capacity checks passed");
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
