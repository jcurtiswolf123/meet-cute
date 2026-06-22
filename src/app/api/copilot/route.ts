import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/auth";
import { answer } from "@/lib/copilot";
import { answerWithTools, toolsEnabled } from "@/lib/copilot-tools";
import { tryOperatorAction } from "@/lib/operator-actions";
import type { ChatMsg } from "@/lib/ai";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const op = await requireOperator();
  if (!op) return NextResponse.json({ error: "operators only" }, { status: 403 });

  // Cap LLM-backed calls to protect cost / quota.
  const rl = await rateLimit(`copilot:${op.id}:${clientKey(req)}`, 15, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Give it a moment." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: { messages?: ChatMsg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const messages = body.messages;
  if (!Array.isArray(messages) || !messages.length || messages.some((m) => typeof m?.content !== "string")) {
    return NextResponse.json({ error: "no messages" }, { status: 400 });
  }
  // Bound input size.
  const trimmed = messages.slice(-10).map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  // Preferred path: a real tool-calling agent (Claude) that can read the roster
  // and take actions. Enabled when ANTHROPIC_API_KEY is set (COPILOT_TOOLS!="0").
  if (toolsEnabled()) {
    const res = await answerWithTools(op.id, trimmed);
    if (res.text) return NextResponse.json(res);
    // fall through to the deterministic path if the agent returned nothing
  }

  // Fallback path: deterministic operator commands first, then the RAG answer.
  const lastUser = [...trimmed].reverse().find((m) => m.role === "user")?.content ?? "";
  const action = await tryOperatorAction(op.id, lastUser);
  if (action.handled) {
    return NextResponse.json({ text: action.text, live: true, provider: "operator-action" });
  }

  const res = await answer(trimmed);
  return NextResponse.json(res);
}
