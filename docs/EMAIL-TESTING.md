# Testing the reply-by-email match path

Three layers. The first two run anywhere and are cheap. The third sends real
mail and is the only one that covers DNS, the webhook secret, provider
behaviour, and what real mail clients put on the wire.

Run all three before touching anything in `src/lib/reply-parse.ts`,
`src/lib/introductions.ts`, `src/lib/email.ts`, or
`src/app/api/email/inbound/route.ts`.

## Layer 1: parser corpus (no database, no network, about a second)

```bash
npm run test:launch:reply
```

51 real client reply shapes: Gmail top-post, Apple Mail bottom-post under the
quote, Outlook's `-----Original Message-----` block, iPhone signatures,
HTML-only replies, autoresponders, greetings, and the agreeable refusals that
used to read as a yes.

The property that matters is asserted separately: **no ambiguous or automated
reply may ever return `yes`**. A missed decision is harmless because the invite
also carries Yes/Pass buttons at `/i/<token>`, but a wrong yes fires the joint
connection email and hands two people each other's contact details, which
cannot be undone. When adding a case, if you are unsure what a reply means, the
expected value is `null`.

## Layer 2: flow against an isolated database (stubbed provider)

```bash
export DATABASE_URL="postgresql://postgres@127.0.0.1:5433/meetcute_test?schema=meetcute"
export DIRECT_URL="$DATABASE_URL"
npx prisma migrate deploy
npm run test:journey:email
npm run test:launch
```

Covers invite minting, the signed webhook, mutual yes producing exactly one
joint connection email, decline closing the match, stale-address cancellation,
and the multi-domain reply address. Both scripts refuse to run against anything
but `127.0.0.1` or `localhost`, so they cannot touch production.

## Layer 3: real inboxes

`scripts/live-reply-e2e.ts` runs the flow end to end against production with
real mail. It creates two disposable people, sends real invites, and deletes
everything afterward. It refuses to start without
`MEETCUTE_LIVE_E2E=i-understand-this-writes-to-production`.

Default recipients are two plus-aliases of one operator mailbox, which needs no
extra accounts. To use genuinely separate inboxes, and this is the only way to
see how a given provider renders and files the message, set `LIVE_E2E_TO` to a
comma-separated pair of addresses **you control**.

### Step 1: send the invites

```bash
cd ~/Projects/meet-cute

MEETCUTE_LIVE_E2E=i-understand-this-writes-to-production \
LIVE_E2E_TO="you@gmail.com,you@outlook.com" \
RESEND_API_KEY="$(fly secrets list -a meet-cute >/dev/null; echo YOUR_KEY)" \
RESEND_FROM="Meet Cute <hello@hellomeetcute.com>" \
RESEND_REPLY_TO="josh@shiftsupportnetwork.com" \
RESEND_INBOUND_DOMAIN=inbound.shiftsupportnetwork.com \
NEXT_PUBLIC_APP_URL=https://hellomeetcute.com \
node --env-file=.env --import tsx scripts/live-reply-e2e.ts setup
```

It prints the match id and the two token reply addresses:

```
A reply-to: r+<token>@inbound.shiftsupportnetwork.com  sent=true
B reply-to: r+<token>@inbound.shiftsupportnetwork.com  sent=true
```

`sent=false` on the last line usually just means the snapshot was taken
mid-drain. Confirm with the `check` command rather than assuming a failure.

### Step 2: reply from the real client

Open each invite in the actual mail app and hit Reply. **Do not paste the token
address into a fresh compose window**: half the point is to capture what that
client does to the body (quote placement, signature, HTML-only, `Reply-To`
handling). Send the shapes you care about, at minimum:

- a plain `Y` or `Yes`
- one with a greeting first, "Hi Josh - yes, I'd love to meet her"
- one bottom-posted under the quote, which Apple Mail does by default
- one agreeable refusal, "Okay so I'm going to pass on this one", which must
  **not** connect

To script the replies instead of clicking, any authenticated SMTP send works,
since the webhook routes on the recipient token and ignores the sender:

```bash
~/.gstack/bin/send-as-josh \
  --to "r+<token>@inbound.shiftsupportnetwork.com" \
  --subject "Re: An introduction" \
  --body-file /tmp/reply.txt
```

That exercises the real MX and webhook but sends whatever body you wrote, so it
does not tell you what a given client produces. Use a real client for that.

### Step 3: check what the flow decided

```bash
MEETCUTE_LIVE_E2E=i-understand-this-writes-to-production \
  node --env-file=.env --import tsx scripts/live-reply-e2e.ts check
```

Two yeses should give `stage: "connected"`, `connectedAt` set, and exactly one
`connection_email_thread` job with `status: "sent"`. Round trip is about 25
seconds. An agreeable refusal or an autoresponder should leave the match
`invited` with both sides `pending`.

If nothing changed, distinguish "the reply never arrived" from "the parser
declined to decide" before touching any code:

```bash
# Did Resend receive it at all?
curl -s https://api.resend.com/emails/receiving \
  -H "Authorization: Bearer $RESEND_API_KEY" | jq '.data[0]'
```

Then replay that exact message to the deployed endpoint with a valid signature
and read the response. `no decision` means it arrived and the parser declined,
which is a parser question. Nothing in the receiving list means it is a DNS or
provider question. The signing secret is on the webhook record at
`GET https://api.resend.com/webhooks/<id>`, and the signed body is
`"{svix-id}.{svix-timestamp}.{raw body}"` HMAC-SHA256 with the
base64-decoded secret, base64 encoded.

### Step 4: always clean up

```bash
MEETCUTE_LIVE_E2E=i-understand-this-writes-to-production \
  node --env-file=.env --import tsx scripts/live-reply-e2e.ts cleanup
```

Deletes every person whose name starts with `ZZ QA Do Not Contact` along with
their matches, invites, and delivery jobs. Confirm the roster count is back to
what it was before you started.

## Checking inbox placement, not just delivery

A `sent` delivery job means Resend accepted the message. It says nothing about
whether it reached an inbox. Check placement separately.

**Read the receiving mailbox.** Check Spam, not only the inbox:

```python
import imaplib, os
pw = open(os.path.expanduser("~/.gstack/credentials/shift-josh-gmail-app-password.txt")).read().split("\n")[0].strip()
M = imaplib.IMAP4_SSL("imap.gmail.com"); M.login("josh@shiftsupportnetwork.com", pw)
for box in ["INBOX", '"[Gmail]/Spam"']:
    M.select(box)
    print(box, len(M.search(None, '(FROM "hellomeetcute.com")')[1][0].split()))
```

**Score the message.** Get an address from https://www.mail-tester.com, put it
in `LIVE_E2E_TO` as the first recipient, run `setup`, then open
`https://www.mail-tester.com/<test-id>`. This scores content, authentication,
formatting, and blocklists, and itemises every SpamAssassin rule that fired.

Last run, 2026-07-28, on the current build: **9.3/10**. Authentication,
formatting, blocklists, and links all clean. The only real deduction was
`-0.8 FROM_FMBLA_NEWDOM28`, the From domain having been registered in the last
14 to 28 days. That is domain age and it ages out on its own.

So when invites file to Spam at Gmail, the cause is not the message. The open
structural item is that **hellomeetcute.com publishes no MX record**, so the
From domain cannot receive mail. See `docs/STATUS.md` for the exact record and
the Cloudflare blocker.

## Things worth knowing before you debug

- **Reply address domain.** Invites go out with `Reply-To:
  r+<token>@<first entry of RESEND_INBOUND_DOMAIN>`. The webhook accepts every
  entry in that comma-separated list. Never reduce it to a single new domain
  while invites are outstanding: those replies arrive on the old domain, fail
  the token match, and are dropped as `no token` with nothing surfaced.
- **The webhook payload carries metadata only.** No body. The route pulls the
  token from the recipient address, and only then fetches the body from the
  receiving API. Replies with no token never trigger a fetch, which is what
  keeps other projects' mail on the same Resend account untouched.
- **`api.resend.com` is Cloudflare-fronted** and rejects requests with no or a
  bare `node` User-Agent. The route already sends a browser UA. From Python use
  `requests` or `curl_cffi`, never `urllib`.
- **Signature freshness is five minutes.** A replay with an old timestamp
  returns 403, which is correct behaviour, not a bug.
- **Repeatedly mailing the same test address trains that mailbox** against the
  sender. Treat a single mailbox's Spam verdict as directional, and move test
  messages out of Spam when you are done.
