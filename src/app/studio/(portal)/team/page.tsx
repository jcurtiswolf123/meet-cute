import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { addOperator, removeOperator } from "@/lib/actions";
import { ConfirmActionForm } from "@/components/forms";
import { Avatar } from "@/components/ui";
import { Select } from "@/components/select";

export const dynamic = "force-dynamic";

// Each operator signs in with an individual magic link. Only a super admin can
// change who has access to the studio.
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
        <h1 className="font-sans tracking-[-0.012em] text-3xl font-medium">Team</h1>
        <p className="mt-1 text-sm text-muted">
          Operators have matchmaking access and sign in with their own email. Super admins
          control operator access, with no shared password.
        </p>
      </div>

      {me.isSuperAdmin && result.invite === "sent" && (
        <p className="rounded-xl border border-ink/25 bg-studio-canvas px-4 py-3 text-sm text-ink">
          {result.operator || "The operator"} was added and the sign-in link was sent.
        </p>
      )}
      {me.isSuperAdmin && result.invite === "failed" && (
        <p className="rounded-xl border border-studio-line bg-studio-subtle px-4 py-3 text-sm text-ink">
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
        <p className="rounded-xl border border-ink/25 bg-studio-canvas px-4 py-3 text-sm text-ink">
          Studio access was revoked for {result.operator || "the operator"}.
        </p>
      )}

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
              <Select
                name="city"
                label="City"
                showLabel
                defaultValue="NYC"
                options={[
                  { value: "NYC", label: "NYC" },
                  { value: "San Francisco", label: "SF" },
                ]}
              />
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
                        <span className="ml-2 rounded-full bg-studio-canvas px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink">
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
                    buttonClassName="rounded-full border border-line px-3 py-1 text-xs hover:border-studio-line hover:text-ink"
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
