// Prelude SMS provider checks. Pure: no database, no network to Prelude.
//
// What matters here is the stuff that only shows up in production otherwise:
// that a template-less send fails loudly instead of quietly delivering nothing,
// that the variable sets match the templates registered in the dashboard, and
// that a webhook cannot be forged.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign as nodeSign, constants } from "node:crypto";

import {
  sendSMS,
  smsProvider,
  introInviteSMS,
  introInviteTemplate,
  feedbackRequestTemplate,
  connectedTemplate,
  verifyPreludeSignature,
  preludeTemplateEnvVar,
  PRELUDE_TEMPLATES,
} from "../src/lib/sms";

// Every one of these reads process.env when called, not when imported, so
// setting the provider here covers the whole file.
process.env.SMS_PROVIDER = "prelude";

// The variable names each registered template declares. Prelude rejects a send
// whose keys do not match exactly, and that rejection is a 422 we would only
// discover on a real send, so pin them here instead.
const REGISTERED_VARIABLES: Record<string, string[]> = {
  intro_invite: ["first_name", "other_first_name", "profile_url"],
  intro_reminder: ["first_name", "other_first_name", "profile_url"],
  connected: ["first_name", "other_first_name", "other_phone"],
  feedback_request: ["first_name", "other_first_name", "operator_first_name", "feedback_url"],
};

function sorted(keys: string[]): string[] {
  return [...keys].sort();
}

async function main() {
  assert.equal(smsProvider(), "prelude", "SMS_PROVIDER=prelude must select Prelude");

  // 1. Every template we can build matches what is registered.
  const built = [
    introInviteTemplate({ toName: "Maya Rosen", otherName: "Alex Chen", profileUrl: "https://x.test/i/tok" }),
    connectedTemplate({ toName: "Maya Rosen", otherName: "Alex Chen", otherPhone: "+16465550123" }),
    feedbackRequestTemplate({
      toName: "Maya Rosen",
      otherName: "Alex Chen",
      operatorName: "Jess Wolf",
      feedbackUrl: "https://x.test/app",
    }),
  ];
  for (const template of built) {
    const expected = REGISTERED_VARIABLES[template.name];
    assert.ok(expected, `${template.name} is not a registered template`);
    assert.deepEqual(
      sorted(Object.keys(template.variables)),
      sorted(expected),
      `${template.name} variables must match the registered template exactly`,
    );
    for (const [key, value] of Object.entries(template.variables)) {
      assert.equal(typeof value, "string", `${template.name}.${key} must be a string`);
      assert.ok(value.length > 0, `${template.name}.${key} must not be empty`);
    }
  }

  // Names are first names only: a template variable that leaked a full name
  // would put someone's surname in a text.
  const invite = introInviteTemplate({
    toName: "Maya Rosen",
    otherName: "Alex Chen",
    profileUrl: "https://x.test/i/tok",
  });
  assert.equal(invite.variables.first_name, "Maya");
  assert.equal(invite.variables.other_first_name, "Alex");

  // 2. Every declared template has an env var name we can resolve.
  for (const name of PRELUDE_TEMPLATES) {
    assert.match(preludeTemplateEnvVar(name), /^PRELUDE_TEMPLATE_[A-Z_]+$/);
  }

  // 3. A send with no template must fail, not silently succeed. This is the one
  //    that would otherwise mark an outbox row delivered having sent nothing.
  const noTemplate = await sendSMS({ to: "+16465550123", body: "hello" });
  assert.equal(noTemplate.ok, false, "a Prelude send without a template must fail");
  if (!noTemplate.ok) {
    assert.equal(noTemplate.retryable, false, "a missing template is a code bug, not a transient error");
    assert.match(noTemplate.error, /template/i);
  }

  // 4. A send whose template id is not configured must fail the same way rather
  //    than posting a request Prelude would reject.
  delete process.env.PRELUDE_TEMPLATE_INTRO_INVITE;
  const unconfigured = await sendSMS({
    to: "+16465550123",
    body: "hello",
    template: invite,
  });
  assert.equal(unconfigured.ok, false, "an unset template id must fail");
  if (!unconfigured.ok) {
    assert.equal(unconfigured.retryable, false);
    assert.match(unconfigured.error, /PRELUDE_TEMPLATE_INTRO_INVITE/);
  }

  // 5. An invalid destination is rejected before any provider work.
  const badNumber = await sendSMS({ to: "nonsense", body: "hello", template: invite });
  assert.equal(badNumber.ok, false);

  // 6. The invite copy drops the Y/N instruction under Prelude, because there is
  //    no inbound SMS to receive a Y.
  const copy = introInviteSMS({
    toName: "Maya Rosen",
    otherName: "Alex Chen",
    profileUrl: "https://x.test/i/tok",
  });
  assert.ok(!/Reply Y\b/.test(copy), "Prelude copy must not promise a Y/N reply that cannot arrive");
  assert.match(copy, /Say yes or pass on that page/);
  assert.match(copy, /Reply STOP to opt out/, "the opt-out disclosure is carrier-required");
  assert.match(copy, /https:\/\/x\.test\/i\/tok/, "the text must carry the decision link");

  // 7. Webhook signatures. Generate a keypair, sign a body, and confirm a good
  //    signature verifies while a tampered body and a wrong prefix do not.
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const body = JSON.stringify({ id: "evt_1", type: "transactional.message.delivered" });
  const signature = nodeSign("sha256", Buffer.from(body, "utf-8"), {
    key: privateKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString("base64url");

  process.env.PRELUDE_WEBHOOK_PUBLIC_KEY = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();

  assert.equal(
    verifyPreludeSignature({ signature: `rsassa-pss-sha256=${signature}`, rawBody: body }),
    true,
    "a correctly signed body must verify",
  );
  assert.equal(
    verifyPreludeSignature({ signature: `rsassa-pss-sha256=${signature}`, rawBody: body + " " }),
    false,
    "a tampered body must not verify",
  );
  assert.equal(
    verifyPreludeSignature({ signature, rawBody: body }),
    false,
    "a signature without the algorithm prefix must not verify",
  );
  assert.equal(
    verifyPreludeSignature({ signature: null, rawBody: body }),
    false,
    "a missing signature must not verify",
  );

  // Env vars can only hold one line, so the key is accepted with escaped newlines.
  process.env.PRELUDE_WEBHOOK_PUBLIC_KEY = process.env.PRELUDE_WEBHOOK_PUBLIC_KEY!.replace(
    /\n/g,
    "\\n",
  );
  assert.equal(
    verifyPreludeSignature({ signature: `rsassa-pss-sha256=${signature}`, rawBody: body }),
    true,
    "a single-line PEM with escaped newlines must still verify",
  );

  // With no key configured, verification fails closed.
  delete process.env.PRELUDE_WEBHOOK_PUBLIC_KEY;
  assert.equal(
    verifyPreludeSignature({ signature: `rsassa-pss-sha256=${signature}`, rawBody: body }),
    false,
    "verification must fail closed when no signing key is configured",
  );

  console.log(
    "prelude sms checks passed: template variables match the registered templates, template-less sends fail loudly, copy carries no unreachable Y/N, and webhook signatures verify",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
