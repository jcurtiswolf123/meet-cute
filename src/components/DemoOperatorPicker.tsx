import { prisma } from "@/lib/prisma";
import { loginAs } from "@/lib/actions";

const isDev = process.env.NODE_ENV !== "production" && process.env.MEETCUTE_DEMO_LOGIN === "1";

/** Local-only one-click operator sign-in buttons. Renders nothing in production. */
export async function DemoOperatorPicker() {
  if (!isDev) return null;

  const operators = await prisma.person.findMany({
    where: { isOperator: true },
    orderBy: { name: "asc" },
  });

  if (operators.length === 0) return null;

  return (
    <>
      {operators.map((o) => (
        <form key={o.id} action={loginAs.bind(null, o.id)}>
          <button type="submit" className="btn-ghost">
            {o.name} · {o.city}
          </button>
        </form>
      ))}
    </>
  );
}
