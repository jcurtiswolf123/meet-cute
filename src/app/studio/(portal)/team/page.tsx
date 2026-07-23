import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { addOperator, removeOperator, setOperatorPhone } from "@/lib/actions";
import { ConfirmActionForm } from "@/components/forms";
import { Avatar } from "@/components/ui";

export const dynamic = "force-dynamic";

// Each operator signs in with an individual magic link. Operators can maintain
// their own group-introduction number, while only a super admin can change who
// has access to the studio.
export default async function Team({
  searchParams,
}: {
  searchParams: Promise<{
    access?: string;
    invite?: string;
    operator?: string;
  }>;
}) {
  const me = await requireOperatorPage();
  const result = await searchParams;

  const operators = await prisma.person.findMany({
    where: { isOperator: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      city: true,
      isSuperAdmin: true,
      photos: { where: { status: "approved" }, take: 1, select: { url: true } },
    },
  });

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="font-display text-3xl font-medium">Team</h1>
        <p className="mt-1 text-sm text-muted">
          Operators have matchmaking access and sign in with their own email. Super admins
          control operator access, with no shared password.
        </p>
      </div>

      {me.isSuperAdmin && result.invite === "sent" && (
        <p className="rounded-xl border border-sage/30 bg-sage/10 px-4 py-3 text-sm text-sage">
          {result.operator || "The operator"} was added and the sign-in link was sent.
        </p>
      )}
      {me.isSuperAdmin && result.invite === "failed" && (
        <p className="rounded-xl border border-claret/30 bg-claret/5 px-4 py-3 text-sm text-claret">
          {result.operator || "The operator"} was added, but the invitation email failed. Ask them
          to request a link from the operator sign-in page.
        </p>
      )}
      {me.isSuperAdmin && result.invite === "created" && (
        <p className="rounded-xl border border-champagne/50 bg-champagne/15 px-4 py-3 text-sm text-ink">
          {result.operator || "The operator"} was added. Ask them to request a link from the
          operator sign-in page.
        </p>
      )}
      {me.isSuperAdmin && result.access === "revoked" && (
        <p className="rounded-xl border border-sage/30 bg-sage/10 px-4 py-3 text-sm text-sage">
          Studio access was revoked for {result.operator || "the operator"}.
        </p>
      )}

      <section className="card p-6">
        <h2 className="label">Your mobile (for group intros)</h2>
        <p className="mt-1 text-sm text-muted">
          When both people in an introduction say yes, we open a group text with the two of them and
          you. Add your cell so you&apos;re in that thread. Without it, we just send each of them the
          other&apos;s number.
        </p>
        <form action={setOperatorPhone} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            name="phone"
            type="tel"
            required
            defaultValue={me.phone ?? ""}
            placeholder="(555) 123-4567"
            autoComplete="off"
            className="field"
            aria-label="Your mobile number"
          />
          <button type="submit" className="btn-primary whitespace-nowrap">
            Save number
          </button>
        </form>
      </section>

      {me.isSuperAdmin ? (
        <section className="card p-6">
          <h2 className="label">Add an operator</h2>
          <form action={addOperator} className="mt-4 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label">Full name</span>
                <input
                  name="name"
                  type="text"
                  required
                  autoComplete="off"
                  className="field mt-1.5"
                  placeholder="Jordan Rivera"
                />
              </label>
              <label className="block">
                <span className="label">Operator email</span>
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="off"
                  className="field mt-1.5"
                  placeholder="name@email.com"
                />
              </label>
              <label className="block">
                <span className="label">City</span>
                <select name="city" className="field mt-1.5" defaultValue="NYC">
                  <option value="NYC">NYC</option>
                  <option value="San Francisco">SF</option>
                </select>
              </label>
            </div>
            <button type="submit" className="btn-primary w-fit whitespace-nowrap">
              Add &amp; invite
            </button>
          </form>
          <p className="mt-2 text-xs text-muted">
            If they already have a member account, this promotes it to operator.
          </p>
        </section>
      ) : (
        <section className="card p-6">
          <h2 className="label">Operator access</h2>
          <p className="mt-2 text-sm text-muted">
            A super admin manages operator invitations and access changes.
          </p>
        </section>
      )}

      <section>
        <h2 className="label">Operators ({operators.length})</h2>
        <ul className="mt-4 space-y-2">
          {operators.map((o) => {
            const isMe = o.id === me.id;
            const canRemove =
              me.isSuperAdmin && !isMe && !o.isSuperAdmin && operators.length > 1;
            return (
              <li
                key={o.id}
                className="card flex flex-col items-stretch justify-between gap-3 p-3 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar url={o.photos[0]?.url} name={o.name} size={40} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {o.name}
                      {isMe && <span className="ml-2 text-xs text-muted">(you)</span>}
                      {o.isSuperAdmin && (
                        <span className="ml-2 rounded-full bg-sage/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sage">
                          Super admin
                        </span>
                      )}
                    </p>
                    <p className="break-all text-xs text-muted">
                      {o.email} · {o.city}
                    </p>
                  </div>
                </div>
                {canRemove ? (
                  <ConfirmActionForm
                    action={removeOperator}
                    className="shrink-0 self-end sm:self-auto"
                    confirmMessage={`Revoke ${o.name}'s studio access? They will be signed out immediately.`}
                    triggerLabel="Revoke access"
                    triggerAriaLabel={`Revoke operator access for ${o.name}`}
                    confirmLabel="Confirm revoke"
                    pendingText="Revoking..."
                    buttonClassName="rounded-full border border-line px-3 py-1 text-xs hover:border-claret/40 hover:text-claret"
                  >
                    <input type="hidden" name="personId" value={o.id} />
                  </ConfirmActionForm>
                ) : (
                  <span className="shrink-0 self-end text-xs text-muted sm:self-auto">
                    {isMe ? "you" : o.isSuperAdmin ? "protected" : "operator"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
