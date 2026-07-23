# Meet Cute Public Launch Checklist

Current status: READY FOR DEPLOY

Last updated: 2026-07-23

Live site: `https://hellomeetcute.com`

Detailed evidence: `docs/LAUNCH-QA-2026-07-23.md`

## Technical launch requirements

- [x] Use machine-independent photo storage in every production configuration.
- [x] Persist introduction email and SMS work in a durable delivery outbox.
- [x] Fence concurrent workers and recover safely from interrupted processing.
- [x] Recheck consent, account, block, match, and token authorization at send time.
- [x] Expose failed delivery work and safe retry actions to operators.
- [x] Remove unsupported booking and calendar claims from active product paths.
- [x] Remove seeded test members and test-named production operator access.
- [x] Enforce dinner capacity transactionally.
- [x] Add schema-aware readiness to the release and Fly health gate.
- [x] Replace manual schema push with checked-in Prisma migrations.
- [x] Configure monitoring paths for Sentry, watchdog alerts, and delivery failures.
- [ ] Remove the two legacy demo secret names from Fly after the production guard deploys.
- [ ] Obtain counsel review of privacy, terms, SMS consent, retention, and safety language.

The counsel item is an external review requirement. The repository does not
claim that the current legal text has been approved by counsel.

## Release verification

- [x] `npm ci` completes from a clean checkout.
- [x] Lint passes with zero warnings.
- [x] Type checking passes.
- [x] All launch tests pass and remove their fixtures.
- [x] The introduction concurrency test passes and removes its fixtures.
- [x] The production build passes without warnings.
- [x] The exact production Docker image builds and starts as user `node`.
- [x] The Docker image contains no local secrets, dumps, or QA artifacts.
- [x] The dependency audit reports zero vulnerabilities.
- [x] Static security scanning reports no unresolved findings.
- [x] Public desktop and mobile browser QA passes without console errors or overflow.
- [ ] Member and operator smoke tests pass on the release image.
- [x] Unsigned webhooks and unauthenticated protected routes are rejected.
- [x] Applicant accounts cannot enter member routes.
- [x] Photo access is limited to authorized viewers.
- [x] Email and SMS failures are visible and recoverable.
- [ ] Both Fly machines pass `/readyz` after the rolling release.
- [ ] Sentry and the scheduled watchdog are healthy after deployment.

## Launch day

1. Freeze and record the release commit.
2. Verify the database backup, target, and migration status.
3. Confirm the GitHub release secrets and watchdog variable by name.
4. Merge the reviewed pull request to `master`.
5. Monitor the migration, database tests, Docker build, and rolling Fly release.
6. Confirm both machines pass `/healthz` and `/readyz`.
7. Remove the production demo secret names and reverify both machines.
8. Run public, member, operator, webhook, and delivery canaries.
9. Monitor Sentry, Fly logs, delivery failures, and moderation during launch.
10. Roll back immediately if authentication, private media, or delivery is inconsistent.

## Verified before deployment

- Public routes render at desktop and mobile sizes without horizontal overflow.
- Member and operator mobile layouts use the full viewport.
- Operator and member sign-out return to the correct login routes.
- Accessibility audits reached 100 on the local home and apply pages.
- The dependency audit and static security scan found no vulnerabilities.
- The delivery, storage, capacity, and decision race suites pass.

Items still unchecked require verification against the final clean commit,
exact Docker image, or deployed production release.
