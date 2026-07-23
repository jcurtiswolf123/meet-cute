# Custom domain: meetcutehq.com

Historical domain exploration. Production is canonical at
`https://hellomeetcute.com`. Do not change the production origin based on the
steps below without a new reviewed domain migration.

Goal: serve the app at `https://meetcutehq.com` (and `www`) on Fly.

## Status

- `meetcutehq.com` appears unregistered (no nameservers on .com/.app/.net/.co/.io).
- Fly TLS certificates have been pre-created for `meetcutehq.com` and
  `www.meetcutehq.com` (pending until DNS points at Fly).

## 1. Buy the domain

Any registrar works. Cheapest at-cost option with free WHOIS privacy:
**Cloudflare Registrar** (~$10/yr for .com). Alternatives: Porkbun, Namecheap.
(Purchase requires your payment, so it is done by you, not the agent.)

## 2. Add these DNS records at the registrar / DNS host

| Type | Name | Value |
|---|---|---|
| A | `@` (meetcutehq.com) | `66.241.125.179` |
| AAAA | `@` (meetcutehq.com) | `2a09:8280:1::12b:1fff:0` |
| A | `www` | `66.241.125.179` |
| AAAA | `www` | `2a09:8280:1::12b:1fff:0` |

(66.241.125.179 is Fly's shared IPv4 for this app; the AAAA is its dedicated IPv6.)

## 3. Validate + go live (agent runs these once DNS is set)

```bash
fly certs check meetcutehq.com -a meet-cute        # wait for "issued"
fly certs check www.meetcutehq.com -a meet-cute
fly secrets set NEXT_PUBLIC_APP_URL=https://meetcutehq.com -a meet-cute
```

Then update `fly.toml` `NEXT_PUBLIC_SITE_URL` to `https://meetcutehq.com` and
deploy. Do NOT switch `NEXT_PUBLIC_APP_URL` until the cert is issued, or magic
links will point at a domain that is not serving yet.

## Notes

- Email (`RESEND_FROM`) currently sends from `meet-cute.app`. Optionally move it
  to `hello@meetcutehq.com` once the domain is verified in Resend (adds SPF/DKIM).
- A dedicated IPv4 ($2/mo, `fly ips allocate-v4`) is optional; the shared IPv4
  works for custom domains.
