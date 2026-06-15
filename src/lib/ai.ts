// AI layer. Primary provider is NVIDIA's free OpenAI-compatible endpoint
// (integrate.api.nvidia.com): Llama 3.1 8B for the co-pilot chat, nv-embedqa
// for embeddings. Claude and OpenAI are optional fallbacks. Everything degrades
// gracefully: with no funded provider, embeddings use a deterministic lexical
// vector and chat uses a local intent engine, so the product always runs.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const NVIDIA_KEY = process.env.NVIDIA_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export const hasNvidia = !!NVIDIA_KEY;
export const hasClaude = !!ANTHROPIC_KEY;
export const hasOpenAI = !!OPENAI_KEY;

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
// 8B is fast and consistent on NVIDIA's free tier (sub-second vs 5 to 55s for
// 70B) and is plenty for ranking a small roster. Override with MEETCUTE_LLM_MODEL.
const NVIDIA_CHAT_MODEL = process.env.MEETCUTE_LLM_MODEL || "meta/llama-3.1-8b-instruct";
const NVIDIA_EMBED_MODEL = "nvidia/nv-embedqa-e5-v5";
const OPENAI_EMBED_MODEL = "text-embedding-3-small";
export const CLAUDE_MODEL = "claude-sonnet-4-6";

const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;
const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;

// NVIDIA's free tier latency is highly variable (occasionally 30 to 60s).
// Bound every call so a slow upstream can never hang a request: on timeout we
// fall through to the next provider / the local engine.
const CHAT_TIMEOUT_MS = Number(process.env.MEETCUTE_CHAT_TIMEOUT_MS) || 18_000;
const EMBED_TIMEOUT_MS = Number(process.env.MEETCUTE_EMBED_TIMEOUT_MS) || 12_000;

async function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---- embeddings -----------------------------------------------------------

// nv-embedqa is asymmetric: store profiles as "passage", search with "query".
export async function embed(text: string, inputType: "query" | "passage" = "passage"): Promise<number[]> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 8000) || "empty";

  if (NVIDIA_KEY) {
    try {
      const res = await fetchWithTimeout(
        `${NVIDIA_BASE}/embeddings`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${NVIDIA_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: NVIDIA_EMBED_MODEL, input: [clean], input_type: inputType, truncate: "END" }),
        },
        EMBED_TIMEOUT_MS
      );
      if (res.ok) {
        const data = await res.json();
        const v = data?.data?.[0]?.embedding;
        if (Array.isArray(v)) return v;
      }
    } catch {
      /* fall through */
    }
  }

  if (openai) {
    try {
      const res = await openai.embeddings.create({ model: OPENAI_EMBED_MODEL, input: clean });
      return res.data[0].embedding;
    } catch {
      return cheapEmbed(clean);
    }
  }
  return cheapEmbed(clean);
}

// Deterministic 256-dim hashed bag-of-words. Offline fallback only.
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
export type CopilotResult = { text: string; live: boolean; provider: string };

export async function copilotReply(system: string, history: ChatMsg[]): Promise<CopilotResult> {
  // 1) NVIDIA (free, primary). Bounded so a slow upstream cannot hang the UI.
  if (NVIDIA_KEY) {
    try {
      const res = await fetchWithTimeout(
        `${NVIDIA_BASE}/chat/completions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${NVIDIA_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: NVIDIA_CHAT_MODEL,
            messages: [{ role: "system", content: system }, ...history],
            max_tokens: 1024,
            temperature: 0.4,
          }),
        },
        CHAT_TIMEOUT_MS
      );
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) return { text, live: true, provider: "NVIDIA Llama 3.1" };
      }
    } catch {
      /* fall through */
    }
  }

  // 2) Claude (if funded)
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
      if (text) return { text, live: true, provider: "Claude" };
    } catch {
      /* fall through */
    }
  }

  // 3) local intent engine (handled by caller)
  return { text: "", live: false, provider: "local engine" };
}
