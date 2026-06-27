import { prisma } from "@/lib/prisma";
import { loginAs, requestMagicLink } from "@/lib/actions";
import { Avatar, Logo } from "@/components/ui";
import { DemoOperatorPicker } from "@/components/DemoOperatorPicker";
import { allowMemberDemoLogin } from "@/lib/demo-login";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const sent = sp.sent === "1";
  const expired = sp.error === "expired";

  return (
    <main className="container-mc min-h-screen py-12">
      <Logo />
      <div className="mt-10 max-w-md">
        <h1 className="font-display text-3xl font-medium tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-muted">
          Enter your email and we will send a one-time sign-in link. New here?{" "}
          <a href="/apply" className="underline decoration-claret/40 underline-offset-2">
            Apply to join
          </a>
          .
        </p>

        {sent ? (
          <div className="card mt-8 p-6">
            <p className="text-sm">
              Check your email for a sign-in link. It expires in 15 minutes and works once.
            </p>
          </div>
        ) : (
          <form action={requestMagicLink} className="mt-8 space-y-3">
            {expired && (
              <p className="text-sm text-claret">
                That link expired or was already used. Request a new one below.
              </p>
            )}
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@email.com"
              className="field"
            />
            <button type="submit" className="btn-primary w-full">
              Send me a sign-in link
            </button>
          </form>
        )}
      </div>

      {allowMemberDemoLogin() && <DemoPicker />}
    </main>
  );
}

// Local-only convenience: pick any seeded user. Server action loginAs throws in
// production, and this block does not render there either.
async function DemoPicker() {
  const members = await prisma.person.findMany({
    where: { isOperator: false, isAmbassador: false, isCoach: false, status: "active" },
    include: { photos: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mt-14 max-w-3xl border-t border-line pt-8">
      <p className="label text-muted">Dev only · demo login</p>

      <h2 className="label mt-6">Operators (matchmaker studio)</h2>
      <div className="mt-3 flex flex-wrap gap-3">
        <DemoOperatorPicker />
      </div>
      <p className="mt-3 text-xs text-muted">
        Or use the{" "}
        <a href="/studio/login" className="underline decoration-claret/40 underline-offset-2">
          studio sign-in page
        </a>
        .
      </p>

      <h2 className="label mt-10">Members (the app)</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <form key={m.id} action={loginAs.bind(null, m.id)}>
            <button className="card flex w-full items-center gap-3 p-3 text-left transition hover:border-claret/40">
              <Avatar url={m.photos[0]?.url} name={m.name} size={40} />
              <span>
                <span className="block text-sm font-medium">{m.name}</span>
                <span className="block text-xs text-muted">
                  {m.city} · {m.headline?.slice(0, 28)}
                </span>
              </span>
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
