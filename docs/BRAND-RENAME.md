# Brand rename: Meet-Cute to Mutuals

Date: 2026-07-31. Branch: `brand/mutuals-rename`.

The product name is now **Mutuals**. Everything a member, operator, or reader
sees says Mutuals: page titles, metadata, the OG image, email templates and
subjects, SMS copy, the legal pages, the ICS calendar entries, the operator
studio chrome, the print guides, and every doc in this repo.

Deployment identifiers were deliberately left on the old name. They are not
copy, they are addresses: changing them in a commit does not rename the thing
they point at, it just points the app at something that does not exist. Each one
below is a separate, ordered cutover.

## What still says meet-cute, and why

| Identifier | Where | Why it is held |
| --- | --- | --- |
| `hellomeetcute.com` | `fly.toml`, `next.config.mjs`, app URL fallbacks, member-facing contact addresses | Live domain. DNS, the Fly certificate, and the verified Resend sending domain all hang off it. |
| `meetcutehq.com`, `www.*` | `next.config.mjs` redirects, Quick Start cover | Owned domains that redirect to the canonical host. |
| `meet-cute.app` | `.env.example` sample `RESEND_FROM` | Not owned, never resolved. Left as-is only because the sample is already inert; the real sender is `hello@hellomeetcute.com`. |
| `meet-cute` (Fly app) | `fly.toml` `app`, `fly ... -a meet-cute` in docs | Renaming the app in `fly.toml` makes `fly deploy` target an app that does not exist. |
| `meetcute_data` | `fly.toml` mount | Existing per-machine volume. Legacy, unread, but the mount must resolve. |
| `meet-cute` (Sentry project) | `fly.toml`, `next.config.mjs`, `watchdog.yml` | Must match the project slug in the `riiva` Sentry org. |
| `meetcute` (Postgres schema) | `.env`, `.env.example`, `deploy.yml`, all applied migrations | The schema physically exists in Neon under this name. Migration SQL is checksummed by `_prisma_migrations`; editing an applied migration breaks `prisma migrate deploy`. |
| `meet_cute_super_admin_jess` | `prisma/migrations/20260723213000_super_admin_role` | Same: applied migration. |
| `~/Projects/meet-cute`, `jcurtiswolf123/meet-cute` | Docs | Local checkout path and GitHub remote. Renaming the directory breaks the launchd jobs, the gstack slug cache, and the `meet-cute-parallel` worktree pointer. |

Outside this repo, still on the old name: the launchd jobs `com.meetcute.a2p`,
`com.meetcute.a2p-nudge`, and `com.meetcute.telnyx-10dlc`; the scripts and
credential files under `~/.gstack/a2p/` and `~/.gstack/credentials/`; the
Cloudflare zones; the Resend sending domain; the Twilio Messaging Service and
A2P brand and campaign; and the Telnyx messaging profile.

## Blocker before this ships: the A2P campaign

The 10DLC campaign on ticket #27999003 is mid-appeal. What carriers vet is the
consistency between the registered campaign (brand name, sample messages, opt-in
description) and what a member actually sees on the opt-in page. That campaign
is registered as **Meet Cute**, and its samples read `Meet Cute (matchmaking):
...`, matching what `/sms-opt-in` and `/apply` said until this branch.

Deploying the rename changes the live consent copy to Mutuals and reintroduces
exactly the brand-versus-page mismatch that the appeal is about.

Recommended order:

1. Get the campaign approved as-is, or withdraw it.
2. Update the campaign brand name and message samples to Mutuals in TCR.
3. Only then deploy this branch.

If the campaign approves first, step 2 is a normal campaign edit rather than a
resubmission, which is the cheaper path.

## Cutover order for the rest

Domain first, because everything else keys off it.

1. **Domain.** Buy the Mutuals domain. Add the zone in Cloudflare, add it to the
   Fly app (`fly certs add`), verify it as a Resend sending domain (DKIM, SPF,
   MX, DMARC), then flip `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`,
   `WATCHDOG_URL`, and `RESEND_FROM`. Keep `hellomeetcute.com` alive as a
   redirect indefinitely: it is in sent email, in the A2P campaign, and on
   printed guides.
2. **Sentry.** Rename the project slug in the `riiva` org, then update
   `fly.toml`, `next.config.mjs`, and `watchdog.yml` together.
3. **Fly app.** Fly cannot rename an app in place. Either keep `meet-cute` (it is
   invisible to members) or create a new app, move the certificate and secrets,
   deploy, and cut DNS over. Keeping it is the recommendation.
4. **Postgres schema.** `ALTER SCHEMA meetcute RENAME TO mutuals` plus a new
   migration, taking downtime. There is no member-visible benefit. The
   recommendation is to keep the schema name.
5. **Repo and directory.** Rename the GitHub repo (GitHub redirects the old
   URL), then the local directory, then re-point the launchd plists, the gstack
   slug cache, and the `meet-cute-parallel` worktree.

Steps 3 through 5 are cosmetic. Only step 1 and the A2P work are worth the
downtime risk.
