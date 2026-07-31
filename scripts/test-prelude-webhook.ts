// Prelude webhook checks. Calls the route handler directly, no server needed.
//
// This is the opt-out path. Prelude has no inbound SMS, so when their
// subscription management is switched on this endpoint is the ONLY way a STOP
// ever reaches us. If it silently fails we would keep texting people who asked
// us to stop, which is the exact failure that got the Twilio campaign killed.
// So: a real signature must be honored, a forged one must not, and an opt-out
// must actually clear consent in the database.
import assert from "node:assert/strict";
import { randomUUID, generateKeyPairSync, sign as nodeSign, constants } from "node:crypto";
import { NextRequest } from "next/server";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Prelude webhook checks require an isolated local database.");
}

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

function signBody(body: string): string {
  const sig = nodeSign("sha256", Buffer.from(body, "utf-8"), {
    key: privateKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString("base64url");
  return `rsassa-pss-sha256=${sig}`;
}

function request(body: string, signature: string | null): NextRequest {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (signature) headers.set("x-webhook-signature", signature);
  return new NextRequest("https://hellomeetcute.com/api/sms/prelude", {
    method: "POST",
    headers,
    body,
  });
}

async function main() {
  // The route only enforces signatures in production, which is the behavior
  // under test. NODE_ENV is typed read-only, so assign through the record.
  (process.env as Record<string, string | undefined>).NODE_ENV = "production";
  process.env.PRELUDE_WEBHOOK_PUBLIC_KEY = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();

  const [{ prisma }, route] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/app/api/sms/prelude/route"),
  ]);

  const suffix = randomUUID().slice(0, 8);
  const phone = "+16465550" + String(100 + (suffix.charCodeAt(0) % 800));
  const email = `prelude-webhook-${suffix}@webhook.test`;

  const person = await prisma.person.create({
    data: { name: "Prelude Webhook Member", email, phone, city: "NYC", smsConsentAt: new Date() },
  });

  try {
    // 1. An unsigned request is rejected outright in production.
    const unsigned = await route.POST(request(JSON.stringify({ type: "x" }), null));
    assert.equal(unsigned.status, 401, "an unsigned webhook must be rejected");

    // 2. A forged signature is rejected.
    const optOutBody = JSON.stringify({
      id: `evt_${suffix}`,
      type: "subscription.phone_number.unsubscribed",
      payload: { phone_number: phone, status: "unsubscribed" },
      created_at: new Date().toISOString(),
    });
    const forged = await route.POST(request(optOutBody, signBody(optOutBody + "tamper")));
    assert.equal(forged.status, 401, "a signature over different bytes must be rejected");

    const stillConsented = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });
    assert.ok(stillConsented.smsConsentAt, "a rejected webhook must not change consent");

    // 3. A correctly signed opt-out clears consent.
    const optOut = await route.POST(request(optOutBody, signBody(optOutBody)));
    assert.equal(optOut.status, 200, "a valid opt-out must be acknowledged");
    const afterOptOut = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });
    assert.equal(afterOptOut.smsConsentAt, null, "STOP must clear SMS consent");

    // 4. A correctly signed opt-in restores it.
    const optInBody = JSON.stringify({
      id: `evt_${suffix}_in`,
      type: "subscription.phone_number.subscribed",
      payload: { phone_number: phone, status: "subscribed" },
      created_at: new Date().toISOString(),
    });
    const optIn = await route.POST(request(optInBody, signBody(optInBody)));
    assert.equal(optIn.status, 200, "a valid opt-in must be acknowledged");
    const afterOptIn = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });
    assert.ok(afterOptIn.smsConsentAt, "START must restore SMS consent");

    // 5. Matching is on the normalized number, not the exact stored string.
    const loose = phone.replace("+1", "");
    const looseBody = JSON.stringify({
      id: `evt_${suffix}_loose`,
      type: "subscription.phone_number.unsubscribed",
      payload: { phone_number: loose, status: "unsubscribed" },
    });
    const looseRes = await route.POST(request(looseBody, signBody(looseBody)));
    assert.equal(looseRes.status, 200);
    const afterLoose = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });
    assert.equal(afterLoose.smsConsentAt, null, "a nationally formatted number must still match");

    // 6. A delivery event is acknowledged and touches nobody's consent.
    await prisma.person.update({ where: { id: person.id }, data: { smsConsentAt: new Date() } });
    const deliveryBody = JSON.stringify({
      id: `evt_${suffix}_del`,
      type: "transactional.message.failed",
      payload: { channel: "sms", reason: "carrier_rejected" },
    });
    const deliveryRes = await route.POST(request(deliveryBody, signBody(deliveryBody)));
    assert.equal(deliveryRes.status, 200, "a delivery event must be acknowledged");
    const afterDelivery = await prisma.person.findUniqueOrThrow({ where: { id: person.id } });
    assert.ok(afterDelivery.smsConsentAt, "a delivery event must not change consent");

    // 7. A body that is not JSON is acknowledged, not retried for two weeks.
    const garbage = await route.POST(request("not json", signBody("not json")));
    assert.equal(garbage.status, 200, "an unparseable body must not be retried forever");

    console.log(
      "prelude webhook checks passed: unsigned and forged events rejected, STOP clears consent, START restores it, numbers match on normalization, delivery events leave consent alone",
    );
  } finally {
    await prisma.person.deleteMany({ where: { email } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
