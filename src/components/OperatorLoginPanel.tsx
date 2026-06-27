import Link from "next/link";
import { requestOperatorMagicLink } from "@/lib/actions";
import { DemoOperatorLoginBlock } from "@/components/DemoOperatorLoginBlock";

export function OperatorLoginPanel({
  sent,
  expired,
  notOperator,
}: {
  sent?: boolean;
  expired?: boolean;
  notOperator?: boolean;
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
        <div className="card mt-8 p-6">
          <p className="text-sm">
            Check your email for a sign-in link. It expires in 15 minutes and works once.
          </p>
        </div>
      ) : (
        <form action={requestOperatorMagicLink} className="mt-8 space-y-3">
          {notOperator && (
            <p className="text-sm text-claret">
              That email is not registered for studio access. Use your operator email, or ask
              another operator to add you from Team.
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
            placeholder="you@meetcute.co"
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
