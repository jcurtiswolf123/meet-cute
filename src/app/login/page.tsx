import { prisma } from "@/lib/prisma";
import { loginAs } from "@/lib/actions";
import { Avatar, Logo } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Login() {
  const operators = await prisma.person.findMany({ where: { isOperator: true }, orderBy: { name: "asc" } });
  const members = await prisma.person.findMany({
    where: { isOperator: false, isAmbassador: false, isCoach: false, status: "active" },
    include: { photos: true },
    orderBy: { name: "asc" },
  });

  return (
    <main className="container-mc min-h-screen py-12">
      <Logo />
      <div className="mt-10 max-w-3xl">
        <h1 className="font-display text-3xl font-medium tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-muted">
          Demo login. Pick anyone to see their view. Operators land in the matchmaker studio;
          members land in the app. (Production would use a magic link / SMS.)
        </p>

        <h2 className="label mt-10">Operators (matchmaker studio)</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {operators.map((o) => (
            <form key={o.id} action={loginAs.bind(null, o.id)}>
              <button className="btn-ghost">{o.name} · {o.city}</button>
            </form>
          ))}
        </div>

        <h2 className="label mt-10">Members (the app)</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <form key={m.id} action={loginAs.bind(null, m.id)}>
              <button className="card flex w-full items-center gap-3 p-3 text-left transition hover:border-claret/40">
                <Avatar url={m.photos[0]?.url} name={m.name} size={40} />
                <span>
                  <span className="block text-sm font-medium">{m.name}</span>
                  <span className="block text-xs text-muted">{m.city} · {m.headline?.slice(0, 28)}</span>
                </span>
              </button>
            </form>
          ))}
        </div>
      </div>
    </main>
  );
}
