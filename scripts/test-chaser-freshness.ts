// The chaser must describe the person as they are when it is sent.
//
// It is queued the moment somebody signs in and sent a day later, and it used
// to be rendered when it was queued: written for a person who had just arrived
// and done nothing, delivered to a person who had had a day to do something.
// Anyone who filled in the details within that day, the ordinary path, was told
// they never started, pointed at the beginning of the form, and never told
// their photos were safe.
//
// On 4 August four people were queued to be told exactly that, having already
// saved everything and uploaded 12 photos between them. Each was one screen
// from being a member.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { queueEmailDelivery, runDeliveryWorkerPass, freshenEmailPayload } from "../src/lib/delivery";
import { unfinishedApplicationEmail } from "../src/lib/email";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("The chaser freshness checks require an isolated local database.");
}

async function main() {
  const email = `chaser-${randomUUID()}@example.test`;
  const person = await prisma.person.create({
    data: { name: "Chaser Person", email, city: "NYC", status: "applicant" },
  });

  try {
    // Queued the way sign-in queues it: nothing done yet, so the stored copy
    // says "you did not finish" and points at the start of the form.
    const stale = unfinishedApplicationEmail({
      name: person.name,
      photos: 0,
      basicsSaved: false,
      applyUrl: "https://hellomutuals.com/apply",
    });
    assert.equal(stale.subject, "You started an application to Mutuals");

    const job = await queueEmailDelivery({
      kind: "application_unfinished",
      to: email,
      subject: stale.subject,
      html: stale.html,
      text: stale.text,
      personId: person.id,
      idempotencyKey: `chaser-freshness-${person.id}`,
      availableAt: new Date(Date.now() - 1000),
    });
    assert.ok(job, "the chaser must queue");

    // Then they do the work: the whole first half, and three photos.
    await prisma.person.update({ where: { id: person.id }, data: { basicsAt: new Date() } });
    for (let i = 0; i < 3; i++) {
      await prisma.photo.create({
        data: { personId: person.id, url: `/api/photos/${randomUUID()}.webp`, status: "approved" },
      });
    }

    await runDeliveryWorkerPass();

    const sent = await prisma.deliveryJob.findFirst({
      where: { personId: person.id, kind: "application_unfinished" },
    });
    assert.ok(sent, "the job must still be there");

    // What actually left has to be the email for where they are now.
    const expected = unfinishedApplicationEmail({
      name: person.name,
      photos: 3,
      basicsSaved: true,
      applyUrl: `${(process.env.NEXT_PUBLIC_APP_URL || "https://hellomutuals.com").replace(/\/$/, "")}/apply/friends`,
    });
    assert.equal(
      expected.subject,
      "Two names and you are a member",
      "guard: the basics-saved variant is the one this is checking for",
    );
    assert.notEqual(expected.subject, stale.subject, "guard: the two must actually differ");

    // What the send path would actually put on the wire, which is the whole
    // point: not the row, the render.
    const onTheWire = await freshenEmailPayload(sent);
    assert.ok(onTheWire, "the chaser must be re-rendered at send time, not sent as stored");
    assert.equal(
      onTheWire.subject,
      expected.subject,
      `sent copy must describe them as they are now. queued said "${stale.subject}"`,
    );
    assert.ok(
      onTheWire.text.includes("/apply/friends"),
      "and must land them on the half they actually stopped at",
    );
    assert.ok(
      onTheWire.text.includes("3 photos"),
      "and must tell them the photos they uploaded after it was queued are safe",
    );

    const delivered = (sent.payload as Record<string, unknown>) ?? {};
    // The worker re-renders at send time, so the stored payload is only the
    // fallback. What matters is that the fresh render is what it would use.
    assert.ok(
      String(delivered.subject) === stale.subject,
      "the stored payload is left alone; freshness is applied at send, not by rewriting rows",
    );
    assert.equal(sent.status, "sent", `the chaser must send, got ${sent.status}: ${sent.lastError}`);
  } finally {
    await prisma.deliveryJob.deleteMany({ where: { personId: person.id } });
    await prisma.photo.deleteMany({ where: { personId: person.id } });
    await prisma.person.delete({ where: { id: person.id } });
    await prisma.$disconnect();
  }

  console.log(
    "chaser freshness checks passed: a chaser queued before the work was done still sends, and the send path re-renders rather than rewriting the queued row",
  );
}

main();
