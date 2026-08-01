// End-to-end check of the Prelude path THROUGH the real app pipeline.
//
// scripts/test-prelude-sms.ts covers the pure pieces. This one answers the
// question that actually matters before flipping the provider in production:
// when the app queues an intro text the way introductions.ts does, does the
// request that reaches Prelude carry the right template id and the right
// variables, and does the outbox record the outcome correctly?
//
// Requires an isolated local database, same guard as the other journey checks.
//
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/... \
//     node --import tsx scripts/test-prelude-pipeline.ts
//
// Pass PRELUDE_LIVE=1 to additionally make one real call to Prelude with the
// configured key. That call is expected to be REJECTED (the templates are under
// review), so it never sends a text and never spends balance. It exists to prove
// the credentials and template ids are real, not just well-formed.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !["127.0.0.1", "localhost"].includes(new URL(databaseUrl).hostname)) {
  throw new Error("Prelude pipeline checks require an isolated local database.");
}

const TEMPLATE_ID = "template_01test0000000000000000000";

type CapturedRequest = { url: string; auth: string | null; body: Record<string, unknown> };

async function main() {
  const [{ prisma }, delivery, sms] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/delivery"),
    import("../src/lib/sms"),
  ]);
  const { drainDeliveryJobs, queueSmsDelivery, makeDeliveryKey } = delivery;
  const { introInviteTemplate, introInviteSMS } = sms;

  process.env.SMS_PROVIDER = "prelude";
  process.env.PRELUDE_API_KEY = "sk_pipeline_test";
  process.env.PRELUDE_TEMPLATE_INTRO_INVITE = TEMPLATE_ID;
  process.env.PRELUDE_CALLBACK_URL = "https://hellomutuals.com/api/sms/prelude";

  // makeDeliveryKey truncates its first part to 48 chars when building the key,
  // so a long prefix stops matching idempotencyPrefix. Keep it short.
  const prefix = `plp-${randomUUID().slice(0, 8)}`;
  const phone = "+16465550188";
  const profileUrl = "https://hellomutuals.com/i/pipelinetoken";

  // Capture what the app would put on the wire, without putting it there.
  const realFetch = globalThis.fetch;
  const captured: CapturedRequest[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    captured.push({
      url,
      auth: new Headers(init?.headers).get("authorization"),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return new Response(JSON.stringify({ id: "msg_pipeline_test" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    // Queue exactly the way introductions.ts queues an intro nudge.
    await queueSmsDelivery({
      kind: "intro_invite_a_sms",
      to: phone,
      body: introInviteSMS({ toName: "Maya Rosen", otherName: "Alex Chen", profileUrl }),
      template: introInviteTemplate({
        toName: "Maya Rosen",
        otherName: "Alex Chen",
        profileUrl,
      }),
      idempotencyKey: makeDeliveryKey(prefix, "invite"),
    });

    const drained = await drainDeliveryJobs({ limit: 5, idempotencyPrefix: prefix });
    assert.equal(drained.processed, 1, "the queued text should be claimed exactly once");
    assert.equal(drained.sent, 1, "the queued text should be reported sent");

    assert.equal(captured.length, 1, "exactly one provider request should be made");
    const req = captured[0]!;
    assert.equal(req.url, "https://api.prelude.dev/v2/notify", "must hit the Notify endpoint");
    assert.equal(req.auth, "Bearer sk_pipeline_test", "must send the configured key as a bearer token");
    assert.equal(req.body.template_id, TEMPLATE_ID, "must send the configured template id");
    assert.equal(req.body.to, phone, "must address the member's E.164 number");
    assert.equal(
      req.body.callback_url,
      "https://hellomutuals.com/api/sms/prelude",
      "delivery events must be routed back to our webhook",
    );
    assert.deepEqual(
      req.body.variables,
      { first_name: "Maya", other_first_name: "Alex", profile_url: profileUrl },
      "variables must match the registered template exactly",
    );
    // The free-text body is for Twilio and Telnyx. It must never leak into a
    // Prelude request, where an unexpected field is a 422.
    assert.ok(!("body" in req.body), "the free-text body must not be sent to Prelude");
    assert.ok(!("text" in req.body), "no stray text field");

    const job = await prisma.deliveryJob.findFirst({
      where: { idempotencyKey: { startsWith: prefix } },
    });
    assert.ok(job, "the delivery job should exist");
    assert.equal(job.status, "sent", "a successful provider response marks the job sent");

    // A stored payload with a bad template must not send the wrong template.
    const badPrefix = `plb-${randomUUID().slice(0, 8)}`;
    await delivery.enqueueDelivery({
      channel: "sms",
      kind: "intro_invite_a_sms",
      recipient: phone,
      payload: { to: phone, body: "x", template: { name: "not_a_real_template", variables: {} } },
      idempotencyKey: makeDeliveryKey(badPrefix, "bad"),
    });
    const before = captured.length;
    await drainDeliveryJobs({ limit: 5, idempotencyPrefix: badPrefix });
    assert.equal(captured.length, before, "an unrecognized template must not reach the provider");
    const badJob = await prisma.deliveryJob.findFirst({
      where: { idempotencyKey: { startsWith: badPrefix } },
    });
    assert.equal(badJob?.status, "failed", "an unrecognized template must fail the job");

    await prisma.deliveryJob.deleteMany({
      where: { OR: [{ idempotencyKey: { startsWith: prefix } }, { idempotencyKey: { startsWith: badPrefix } }] },
    });
  } finally {
    globalThis.fetch = realFetch;
  }

  // Optional live leg: same code path, real credentials, real endpoint.
  if (process.env.PRELUDE_LIVE === "1") {
    const liveKey = process.env.PRELUDE_LIVE_API_KEY;
    const liveTemplate = process.env.PRELUDE_LIVE_TEMPLATE_INTRO_INVITE;
    assert.ok(liveKey && liveTemplate, "PRELUDE_LIVE=1 needs PRELUDE_LIVE_API_KEY and PRELUDE_LIVE_TEMPLATE_INTRO_INVITE");
    process.env.PRELUDE_API_KEY = liveKey;
    process.env.PRELUDE_TEMPLATE_INTRO_INVITE = liveTemplate;

    // A real, valid number, so the rejection we get back is about template
    // validation rather than a malformed destination. Any 400 would satisfy a
    // loose assertion, which would hide the difference.
    const result = await sms.sendSMS({
      to: process.env.PRELUDE_LIVE_TO || "+16465860039",
      body: "unused by prelude",
      template: introInviteTemplate({ toName: "Maya Rosen", otherName: "Alex Chen", profileUrl }),
    });
    // Templates are under review, so the only correct outcome is a rejection.
    // A success here would mean we just sent a real text from a test.
    assert.equal(result.ok, false, "the live leg must not actually send while templates are pending");
    if (!result.ok) {
      assert.match(
        result.error,
        /template_not_validated/,
        `expected the template-validation gate, got: ${result.error}`,
      );
      assert.equal(result.retryable, false, "an unvalidated template must not be retried");
    }
    console.log(
      "prelude live leg: key and template id are real, balance is funded, and the only remaining gate is template validation",
    );
  }

  await prisma.$disconnect();
  console.log(
    "prelude pipeline checks passed: the outbox reaches Notify with the right template id, variables, callback, and bearer token, and an unknown template never reaches the provider",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
