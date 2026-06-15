// AI layer: Claude for the matchmaker co-pilot chat, OpenAI for embeddings.
// Both degrade gracefully: if a key is missing, embeddings fall back to a
// deterministic bag-of-words vector and chat falls back to a templated reply,
// so the product runs end-to-end with or without network access.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export const hasClaude = !!ANTHROPIC_KEY;
export const hasOpenAI = !!OPENAI_KEY;

const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;
const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

const EMBED_MODEL = "text-embedding-3-small";
export const CLAUDE_MODEL = "claude-sonnet-4-6";

// ---- embeddings -----------------------------------------------------------

export async function embed(text: string): Promise<number[]> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 8000);
  if (openai) {
    try {
      const res = await openai.embeddings.create({ model: EMBED_MODEL, input: clean });
      return res.data[0].embedding;
    } catch {
      return cheapEmbed(clean);
    }
  }
  return cheapEmbed(clean);
}

// Deterministic 256-dim hashed bag-of-words. Not as good as a real model but
// gives meaningful keyword-overlap similarity offline.
export function cheapEmbed(text: string, dims = 256): number[] {
  const v = new Array(dims).fill(0);
  for (const tok of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (tok.length < 3) continue;
    let h = 2166136261;
    for (let i = 0; i < tok.length; i++) {
      h ^= tok.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    v[Math.abs(h) % dims] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ---- co-pilot chat --------------------------------------------------------

export type ChatMsg = { role: "user" | "assistant"; content: string };

export async function copilotReply(
  system: string,
  history: ChatMsg[]
): Promise<{ text: string; live: boolean }> {
  if (anthropic) {
    try {
      const res = await anthropic.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
      });
      const text = res.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("\n")
        .trim();
      return { text, live: true };
    } catch (e) {
      return { text: fallbackReply(history), live: false };
    }
  }
  return { text: fallbackReply(history), live: false };
}

function fallbackReply(history: ChatMsg[]): string {
  const last = history.filter((m) => m.role === "user").at(-1)?.content ?? "";
  return [
    "(Co-pilot is running in offline mode - set ANTHROPIC_API_KEY for full reasoning.)",
    "",
    `I read your request: "${last.slice(0, 140)}".`,
    "The matched candidates and roster facts below were retrieved from the live roster; I just can't add free-form reasoning without the model key.",
  ].join("\n");
}
