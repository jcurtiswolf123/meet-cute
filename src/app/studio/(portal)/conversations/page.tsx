import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { conversationHealth, toneClass } from "@/lib/conversation-health";

export const dynamic = "force-dynamic";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

// Operator console: visibility into every active introduction conversation.
// Shows who has opted in, a health badge, and the last activity, with a row per
// intro that links to the full transcript + a jump-in box.
export default async function Conversations() {
  const intros = await prisma.match.findMany({
    where: { stage: { in: ["invited", "mutual_yes", "connected"] } },
    include: {
      personA: { select: { name: true } },
      personB: { select: { name: true } },
      introMessages: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, body: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const rows = intros.map((m) => {
    const lastMessageAt = m.introMessages[0]?.createdAt ?? null;
    const health = conversationHealth({
      stage: m.stage,
      aDecision: m.aDecision,
      bDecision: m.bDecision,
      aName: m.personA.name,
      bName: m.personB.name,
      notifiedAt: m.notifiedAAt ?? m.notifiedBAt ?? null,
      connectedAt: m.connectedAt,
      lastMessageAt,
    });
    return { m, health, lastMessageAt, lastBody: m.introMessages[0]?.body ?? null };
  });

  const needsAttention = rows.filter((r) => r.health.needsAttention).length;
  const connected = rows.filter((r) => r.m.stage === "connected").length;
  const optIn = (m: { aDecision: string; bDecision: string }) =>
    `${m.aDecision === "yes" ? "Y" : m.aDecision === "pass" ? "N" : "-"} / ${m.bDecision === "yes" ? "Y" : m.bDecision === "pass" ? "N" : "-"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-medium">Conversations</h1>
        <p className="mt-1 text-sm text-muted">
          Every active introduction, who has opted in, and whether it needs you. Open one to read the
          thread and jump in.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active", value: rows.length },
          { label: "Needs attention", value: needsAttention },
          { label: "Connected", value: connected },
        ].map((k) => (
          <div key={k.label} className="card p-4">
            <div className="font-display text-2xl text-ink">{k.value}</div>
            <div className="mt-0.5 text-xs uppercase tracking-wide text-muted">{k.label}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          No active conversations yet. Start an introduction from{" "}
          <Link href="/studio/matchmaking" className="text-claret underline">Matchmaking</Link>.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl2 border border-line bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-line bg-paper/60 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Pair</th>
                <th className="px-4 py-3 font-medium">Opt-in (A/B)</th>
                <th className="px-4 py-3 font-medium">Health</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
                <th className="px-4 py-3 font-medium">Thread</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ m, health, lastMessageAt, lastBody }) => (
                <tr key={m.id} className="border-b border-line/70 hover:bg-cream/60">
                  <td className="px-4 py-3 font-medium text-ink">
                    {firstName(m.personA.name)} + {firstName(m.personB.name)}
                    {m.conversationSid && (
                      <span className="ml-2 inline-flex items-center rounded-full border border-sage/30 bg-sage/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-sage">
                        group
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{optIn(m)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClass(health.tone)}`}>
                      {health.label}
                    </span>
                  </td>
                  <td className="max-w-[24ch] truncate px-4 py-3 text-muted">
                    {lastBody ? <span title={lastBody}>{lastBody}</span> : "-"}
                    {lastMessageAt && (
                      <span className="block text-[11px] text-muted/70">
                        {lastMessageAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/studio/conversations/${m.id}`} className="text-claret underline underline-offset-2">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
