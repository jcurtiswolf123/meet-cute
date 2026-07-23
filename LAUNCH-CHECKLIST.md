# Meet Cute Public Launch Checklist

Current status: HOLD

Last updated: 2026-07-23

Live site: `https://hellomeetcute.com`

Detailed evidence: `docs/LAUNCH-QA-2026-07-23.md`

## Required before public launch

- [ ] Configure shared object storage for approved photos and prove an upload can be read from both Fly machines.
- [ ] Move introduction email and SMS side effects into durable queued work with provider identifiers, retries, and visible per-channel status.
- [ ] Recover safely when the process exits after database state changes but before delivery completes.
- [ ] Wire real concierge delivery, calendar, and booking operations, or disable every action and claim that implies those operations exist.
- [ ] Remove production demo-login secrets and audit or remove test operator accounts.
- [ ] Add database readiness to the release gate and document a tested rollback path for schema changes.
- [ ] Enforce event capacity transactionally before accepting a reservation.
- [ ] Give the watchdog real alert delivery and production Sentry access, then prove a generated failure reaches the operator.
- [ ] Arrange legal review of the current privacy policy, terms, SMS consent, retention, and safety language.

## Release verification

- [ ] `npm ci` completes from a clean checkout.
- [ ] Lint passes with zero warnings.
- [ ] Type checking passes.
- [ ] The introduction concurrency test passes and leaves no QA rows.
- [ ] The production build passes.
- [ ] The production Docker image builds and starts through the standalone server.
- [ ] The production dependency audit reports zero high or critical findings.
- [ ] Static security scanning reports no unresolved high-confidence findings.
- [ ] Public desktop and mobile browser QA passes with no console errors or horizontal overflow.
- [ ] Member desktop and mobile browser QA passes across sign-in, suggestion, profile, settings, and sign-out.
- [ ] Operator desktop and mobile browser QA passes across roster, introduction, drawer, and sign-out.
- [ ] Unsigned email, SMS, and conversation webhooks are rejected.
- [ ] Applicant accounts cannot enter member routes.
- [ ] Photo access is limited to the owner, an operator, or a connected and unblocked member.
- [ ] Email and SMS delivery failures are visible and recoverable.
- [ ] Sentry receives a controlled test error with source maps.
- [ ] Both Fly machines pass health checks after a rolling release.

## Launch day

1. Freeze the release commit and record its SHA.
2. Verify the database backup and schema target.
3. Apply any reviewed schema changes.
4. Deploy the frozen commit.
5. Confirm both Fly machines pass `/healthz`.
6. Run the public, member, operator, webhook, and provider smoke tests.
7. Monitor delivery failures, Sentry, application logs, and moderation throughout the launch window.
8. Roll back immediately if authentication, private photo access, or introduction delivery is inconsistent.

## Already verified on the launch QA branch

- Public routes render at desktop and mobile sizes without horizontal overflow.
- The member and operator mobile layouts use the full viewport.
- Operator and member sign-out return to the correct login routes.
- Accessibility audits reached 100 on the local home and apply pages after contrast and landmark fixes.
- Unsigned webhooks and unauthenticated protected routes reject requests.
- The dependency audit and static security scan found no current high-confidence issues.
- The introduction decision concurrency test produces one consistent outcome and cleans up its fixtures.

These branch results are not production results until the branch is deployed and the post-deploy checks pass.
