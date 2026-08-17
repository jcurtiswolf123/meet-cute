import Link from "next/link";
import { requestOperatorMagicLink } from "@/lib/actions";
import { DemoOperatorLoginBlock } from "@/components/DemoOperatorLoginBlock";
import { SignInCodeForm } from "@/components/SignInCodeForm";

export function OperatorLoginPanel({
  sent,
  expired,
  notOperator,
  email,
  codeError,
}: {
  sent?: boolean;
  expired?: boolean;
  notOperator?: boolean;
  email?: string;
  codeError?: string;
}) {
  return (
    <div className="mx-auto max-w-md">
      <p className="label text-claret">Matchmaker studio</p>
      <h1 className="mt-2 font-display text-3xl font-medium tracking-tight">Operator sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Enter your operator email for a one-time sign-in link. Members sign in on the{" "}
        <Link href="/login" className="underline decoration-claret/40 underline-offset-2">
          member page
        </Link>
        .
      </p>

      {sent ? (
        <SignInCodeForm email={email} after="/studio/login" error={codeError} />
      ) : (
        <form action={requestOperatorMagicLink} className="mt-8 space-y-3">
          {notOperator && (
            <p className="text-sm text-claret">
              That email is not registered for studio access. Use your operator email, or ask
              a super admin to add you from Team.
            </p>
          )}
          {expired && (
            <p className="text-sm text-claret">
              That link expired or was already used. Request a new one below.
            </p>
          )}
          <label htmlFor="operator-email" className="label">
            Operator email
          </label>
          <input
            id="operator-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@hellomutuals.com"
            className="field"
          />
          <button type="submit" className="btn-primary w-full">
            Send sign-in link
          </button>
        </form>
      )}

      <DemoOperatorLoginBlock />
    </div>
  );
}
