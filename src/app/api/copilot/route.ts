import { NextResponse } from "next/server";
import { requireOperator } from "@/lib/auth";
import { answer } from "@/lib/copilot";
import type { ChatMsg } from "@/lib/ai";

export async function POST(req: Request) {
  const op = await requireOperator();
  if (!op) return NextResponse.json({ error: "operators only" }, { status: 403 });
  const { messages } = (await req.json()) as { messages: ChatMsg[] };
  if (!Array.isArray(messages) || !messages.length) {
    return NextResponse.json({ error: "no messages" }, { status: 400 });
  }
  const res = await answer(messages.slice(-10));
  return NextResponse.json(res);
}
