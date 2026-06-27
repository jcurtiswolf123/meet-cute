import { prisma } from "@/lib/prisma";
import { loginAs } from "@/lib/actions";
import { allowOperatorDemoLogin } from "@/lib/demo-login";

/** Operator quick-login block (local dev, or production when passphrase-gated). */
export async function DemoOperatorLoginBlock() {
  if (!allowOperatorDemoLogin()) return null;

  const operators = await prisma.person.findMany({
    where: { isOperator: true },
    orderBy: { name: "asc" },
  });

  if (operators.length === 0) return null;

  const needsPassword = !!process.env.STUDIO_DEMO_PASSWORD;
  const label =
    process.env.NODE_ENV === "production"
      ? "Demo login · passphrase required"
      : "Dev only · demo login";

  return (
    <div className="mt-8 border-t border-line pt-8">
      <p className="label text-muted">{label}</p>
      <div className="mt-3 space-y-4">
        {operators.map((o) => (
          <form key={o.id} action={loginAs.bind(null, o.id)} className="flex flex-wrap items-end gap-3">
            {needsPassword && (
              <label className="block min-w-[12rem] flex-1">
                <span className="label">Passphrase</span>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Studio demo passphrase"
                  className="field mt-1.5"
                />
              </label>
            )}
            <button type="submit" className="btn-ghost">
              {o.name} · {o.city}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
