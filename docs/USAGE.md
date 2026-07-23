# Meet Cute Usage

Last updated 2026-07-23.

## Members

1. Visit `https://hellomeetcute.com/apply`.
2. Enter an email and use the single-use sign-in link.
3. Complete the application and adult, legal, and optional SMS-consent steps.
4. Wait for an operator to activate the account.
5. Complete a profile and submit photos for review.
6. Review one curated introduction and choose yes or pass.
7. On a mutual yes, use the delivered connection details.
8. Use Settings to block, report, export data, or delete the account.

The service does not automatically reserve a venue or send a calendar invite.

## Operators

Sign in at `/login` with an authorized operator email. The Studio supports:

- Applicant and roster review
- Curated suggestions and pipeline management
- Photo and safety moderation
- Dinner and RSVP management
- Operator team access
- Supported co-pilot queries and actions
- Delivery-failure review and safe retry

The delivery panel identifies the affected context and masks recipient data.
Retry only after correcting the underlying issue. The app rechecks current
authorization before sending.

## Local operation

```bash
npm ci
npm run db:deploy
npm run db:seed
npm run dev
```

Use `.env.example` as the template. Never target an unknown database with seed
or database-backed test commands.

## Release operation

Changes reach production through the GitHub workflow on `master`. It runs code
and database tests, applies checked-in migrations, deploys to Fly, and checks
both liveness and readiness. Use `DEPLOYMENT.md` for the complete procedure.
