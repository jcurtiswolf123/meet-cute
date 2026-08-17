# Deliverability

Measured 2026-08-16 against `joshcurtiswolf@gmail.com`, a real consumer Gmail,
by sending the live templates and then asking Gmail itself where each one landed
(`X-GM-RAW category:...`) and what it made of the authentication headers.

## Where it stands

Nothing is going to spam. Over 928 messages sent from `hellomutuals.com` since
the domain was created on 2026-08-01: 914 delivered, 7 bounced (0.75%), 7
suppressed, zero complaints. Gmail stamps every message `spf=pass dkim=pass
dmarc=pass`, with `dkim.d=hellomutuals.com`, so DMARC aligns on both axes.

One template does not reach the Primary tab: **the match invite**. It files under
Promotions on every shape tested. Everything else (sign-in link, vouch request,
vouch thanks, application received, welcome) lands in Primary.

## What was tried on the match invite

Each sample was sent on its own, four minutes apart, with its own subject. That
spacing matters: the first attempt sent six variants inside nine seconds and
every one of them was filed under Promotions, including shapes that land in
Primary when sent alone. A burst of near identical mail from one sender is
itself the bulk signal.

| Variant | Result |
| --- | --- |
| Current template, full brand shell, pill button | Promotions |
| Brand shell with no wordmark, no footer tagline, text link instead of a button | Promotions |
| Plain letter, no shell, no table layout, one text link | Promotions |
| Plain letter from `Josh at Mutuals <josh@hellomutuals.com>` | Promotions |
| Text only, no HTML part at all | Promotions |

Markup is not the cause. Neither is the button, the footer, the From display
name, or the images (the tested samples carried none).

## What actually moves it

A sender in the recipient's contacts overrides the classifier. The welcome
email lands in Primary and is the last thing a member reads before introductions
start, so it now asks them to add `hello@hellomutuals.com` to their contacts.
Replies help too, and the invite already asks for one: a member who answers Y or
N trains Gmail that this sender is correspondence.

## DNS, as of 2026-08-16

| Record | Value | Why |
| --- | --- | --- |
| `hellomutuals.com TXT` | `v=spf1 include:amazonses.com ~all` | The root had no SPF at all. Resend's envelope is on `send.`, so this is anti-spoofing rather than a pass requirement. |
| `hellomutuals.com MX` | `10 inbound-smtp.us-east-1.amazonaws.com` | The From address used to bounce. See below. |
| `_dmarc TXT` | `v=DMARC1; p=quarantine; pct=100; fo=1; rua=mailto:dmarc@hellomutuals.com; ruf=mailto:dmarc@hellomutuals.com` | Was `p=none` reporting to `josh@shiftsupportnetwork.com`, which is a different domain and had no `_report._dmarc` authorization record, so no report was ever deliverable. Resend is the only sender and it aligns, so enforcement is safe. |
| `send TXT` / `send MX` / `resend._domainkey TXT` | unchanged | Resend's own records, verified. |

## The From address is a real mailbox now

`hello@hellomutuals.com` had no MX. Every reply to it bounced and the DMARC
reports had nowhere to go. Resend receiving is enabled on the domain and the
inbound webhook forwards anything without an invite token to
`INBOUND_FORWARD_TO` (`josh@shiftsupportnetwork.com`), preserving the original
sender as Reply-To. Verified end to end on 2026-08-16.

Invite replies now use `r+<token>@hellomutuals.com`;
`inbound.shiftsupportnetwork.com` stays in `RESEND_INBOUND_DOMAIN` so invites
already sitting in a member's inbox still resolve.

## Checking it again

```bash
python3 scripts/placement-check.py            # send, wait, report
python3 scripts/placement-check.py --report-only <tag>
```

Send one template at a time with real gaps between them, or the burst effect
above will contaminate the reading.

## Still open

Google Postmaster Tools is not set up, so there is no view of the domain's spam
rate or reputation as Google scores it. It needs Joshua to add the domain under
whichever Google account should own it (the browser is signed in as
`joshua.wolf@joinhandshake.com`, which is the wrong identity for a personal
venture). The verification is a TXT record, which is a one line change once the
account is picked.
