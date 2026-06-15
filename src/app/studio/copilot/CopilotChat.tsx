"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

// Animated thinking indicator that reassures once a wait runs long.
function Thinking() {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
      <span className="flex gap-1">
        {[0, 1, 2].map((d) => (
          <span
            key={d}
            className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-muted/60"
            style={{ animationDelay: `${d * 150}ms` }}
          />
        ))}
      </span>
      <span>{secs >= 5 ? "still thinking, the model is busy (this can take a few seconds)" : "thinking"}</span>
    </div>
  );
}

const STARTERS = [
  "Show me candidates for Jordan and why",
  "What did we note about Maya?",
  "Catch me up on Ben",
  "Who haven't I suggested in 60 days?",
  "Draft an intro note for Elena",
];

export default function CopilotChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    // Safety net: the server bounds the model to ~18s, so 30s here only fires
    // on a genuinely stuck connection. The UI never hangs.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setMessages((m) => [...m, { role: "assistant", content: "That was quick. Give it a few seconds and try again." }]);
        return;
      }
      if (!res.ok || !data.text) {
        setMessages((m) => [...m, { role: "assistant", content: data.error ?? "The co-pilot had trouble with that one. Try rephrasing." }]);
        return;
      }
      setLive(data.live ?? null);
      setProvider(data.provider ?? "");
      setMessages((m) => [...m, { role: "assistant", content: data.text }]);
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      setMessages((m) => [
        ...m,
        { role: "assistant", content: aborted ? "That took too long. The model is busy right now, try again in a moment." : "Network error. Try again." },
      ]);
    } finally {
      clearTimeout(timer);
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-180px)] max-w-2xl flex-col">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-medium">Matchmaker co-pilot</h1>
        {live !== null && (
          <span className={`pill ${live ? "border-sage/40 text-sage" : ""}`}>
            {provider || (live ? "AI live" : "local engine")}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">Internal only. Ask about the roster, draft notes, recall history, rank suggestions.</p>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto rounded-xl2 border border-line bg-white p-4">
        {!messages.length && (
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button key={s} onClick={() => send(s)} className="pill hover:border-claret/40">{s}</button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user" ? "bg-claret text-cream" : "bg-paper text-ink"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && <Thinking />}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask the co-pilot..."
          className="field"
          disabled={busy}
        />
        <button className="btn-primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
