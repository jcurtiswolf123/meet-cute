import { signInWithCode } from "@/lib/actions";

// The "we sent it" panel, with the code box in it.
//
// The link in that email opens in Safari. On a phone with Mutuals installed to
// the home screen, Safari is not where the person is: an installed web app has
// its own cookie store, so the link signs in a browser they are not looking at
// and the app stays on this screen. The code is typed here, so the session
// lands here.
//
// The address is carried in the query string rather than asked for twice. It is
// the requester's own address and they typed it a second ago; making them type
// it again on a phone keyboard is how a two-step sign-in becomes a three-step
// one.
export function SignInCodeForm({
  email,
  after,
  error,
}: {
  email?: string;
  /** The page to come back to if the code is wrong. */
  after: string;
  error?: string;
}) {
  const message =
    error === "code"
      ? "That code is wrong or has expired. Check the newest email, or request another."
      : error === "throttled"
        ? "Too many tries. Wait a few minutes and request a new code."
        : null;

  return (
    <div className="card mt-8 p-6">
      <p className="text-sm">
        Check your email. There is a sign-in link and a six-digit code, and either one works. Both
        expire in 15 minutes and work once.
      </p>
      <p className="mt-2 text-sm text-muted">
        On a phone with Mutuals on your home screen, use the code: the link opens in Safari, which
        signs in the browser rather than the app.
      </p>

      <form action={signInWithCode} className="mt-5 space-y-3">
        <input type="hidden" name="after" value={after} />
        {message && (
          <p role="alert" className="text-sm text-claret">
            {message}
          </p>
        )}

        {email ? (
          <input type="hidden" name="email" value={email} />
        ) : (
          <>
            <label htmlFor="code-email" className="label">
              Email
            </label>
            <input
              id="code-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="field"
            />
          </>
        )}

        <label htmlFor="signin-code" className="label">
          Six-digit code
        </label>
        <input
          id="signin-code"
          name="code"
          // `inputMode` and `autoComplete` together are what make iOS offer the
          // code straight from the notification instead of a trip to Mail.
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          placeholder="000000"
          className="field text-center font-mono text-2xl tracking-[0.4em]"
        />
        <button type="submit" className="btn-primary w-full">
          Sign in
        </button>
      </form>

      {email && (
        <p className="mt-4 text-xs text-muted">
          Sent to {email}. Wrong address?{" "}
          <a href={after} className="underline decoration-claret/40 underline-offset-2">
            Start again
          </a>
          .
        </p>
      )}
    </div>
  );
}
