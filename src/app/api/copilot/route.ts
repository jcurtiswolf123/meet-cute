import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/auth";
import { answer } from "@/lib/copilot";
import type { ChatMsg } from "@/lib/ai";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const op = await requireOperator();
  if (!op) return NextResponse.json({ error: "operators only" }, { status: 403 });

  // Cap LLM-backed calls to protect cost / quota.
  const rl = rateLimit(`copilot:${op.id}:${clientKey(req)}`, 15, 60_000);
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
  const res = await answer(trimmed);
  return NextResponse.json(res);
}
