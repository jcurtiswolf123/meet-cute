# Texting on Prelude

Twilio texting is dead. The 10DLC campaign `QE2c6890da8086d771620e9b13fadeba0b` is
in FAILED state, every send returns error 30034, and the appeal has been open
since 2026-07-16. Prelude is the way back, because Prelude lists the United
States as **"No registration"**: no brand, no campaign, no TCR.

Flip to it with `SMS_PROVIDER=prelude`.

## What you give up

This is not a drop-in swap, and pretending otherwise would ship a broken flow.

**There is no inbound SMS.** Prelude's inbound webhook carries WhatsApp only. No
member can reply Y, N, or STOP by text, and no code path should expect it. The
invite text now links to the token-gated page and says "Say yes or pass on that
page" rather than "Reply Y for yes"; decisions arrive from that page or from an
email reply, which is where the flow already worked.

**There is no free text.** Notify sends pre-registered templates by id with a
variables map that must match the template exactly, or it returns a 422. Message
copy lives in two places that have to agree: the body builders in `src/lib/sms.ts`
for Twilio and Telnyx, and the templates registered in the Prelude dashboard.
`scripts/test-prelude-sms.ts` pins the variable names so a drift fails the build
rather than a send.

**There is no group MMS.** Twilio Conversations projected-address masking has no
equivalent, so `createGroupConversation` declines and the caller brokers numbers
directly, exactly as it already does under Telnyx.

## What is already set up

Account `josh@shiftsupportnetwork.com`, app **Mutuals**, sender ID `Mutuals`,
region United States. API key in `~/.gstack/credentials/prelude-api-key.txt`.

Four transactional templates, created 2026-07-31:

| Template | Variables |
| --- | --- |
| `intro_invite` | `first_name`, `other_first_name`, `profile_url` |
| `intro_reminder` | `first_name`, `other_first_name`, `profile_url` |
| `connected` | `first_name`, `other_first_name`, `other_phone` |
| `feedback_request` | `first_name`, `other_first_name`, `operator_first_name`, `feedback_url` |

Company registration submitted with the same identity the SMS opt-in page already
names: Vanguard Labs LLC, EIN 99-2503371, 28310 Roadside Drive Suite 218, Agoura
Hills CA 91301-4942.

## What is still blocking a live send

1. **Templates are under review.** All four read "Pending (1/1)". Prelude said
   they would be in touch. Nothing sends until they approve.
2. **The balance is EUR 0.00.** Every call returns HTTP 402
   `insufficient_balance`. Auth is confirmed working, since a bad key returns 401.
   Topping up is a card charge and needs Joshua's approval.
3. **Opt-out is not wired.** STOP, START, and HELP are handled by Prelude's
   subscription management, which their Customer Success team enables per
   account. It is not self-serve. Until it is on, this provider has no opt-out
   path at all, and `/api/sms/prelude` will never receive a subscription event.
   Do not run real traffic before that is switched on: honoring STOP is a CTIA
   requirement, not an optimization.

## Going live

```bash
fly secrets set -a meet-cute \
  SMS_PROVIDER=prelude \
  PRELUDE_API_KEY=... \
  PRELUDE_TEMPLATE_INTRO_INVITE=template_01kywrc9kpf6189senntzq12f8 \
  PRELUDE_TEMPLATE_INTRO_REMINDER=template_01kywrc9mdf61ahdavbeq2725y \
  PRELUDE_TEMPLATE_CONNECTED=template_01kywrc9mrf61b41gkrz3pa4c8 \
  PRELUDE_TEMPLATE_FEEDBACK_REQUEST=template_01kywrc9n7f619v1b4tkvr74tp \
  PRELUDE_CALLBACK_URL=https://hellomeetcute.com/api/sms/prelude \
  PRELUDE_WEBHOOK_PUBLIC_KEY="$(cat prelude-webhook.pem)"
```

Generate the webhook signing key in the dashboard under Verify API, Configure,
Webhooks. The same key signs Notify events. In production `/api/sms/prelude`
returns 401 for every request unless that key is set, so set it before flipping
the provider, not after.

Rolling back is one secret: `SMS_PROVIDER=twilio`. Nothing else has to change,
and the outbox keeps its queued jobs either way.

## Why the outbox did not change

`queueSmsDelivery` now carries an optional `template` alongside `body`. Twilio
and Telnyx ignore it, Prelude requires it, and a job queued before this change
simply has none. `smsTemplateField` in `delivery.ts` validates the stored shape
rather than trusting it, so a malformed row cannot make the sender pick the wrong
template. A Prelude send that arrives without a template fails as non-retryable,
because a missing template is a bug in the caller and no amount of retrying fixes
it. The alternative, sending nothing while the outbox records success, is the
failure mode worth designing against.
