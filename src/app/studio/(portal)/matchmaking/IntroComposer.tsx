"use client";

import { useId, useMemo, useState } from "react";
import { createIntroduction } from "@/lib/actions";

type Person = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  canText: boolean;
  city: string;
  instagram: string | null;
  blurb?: string;
};

function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// Mirrors aboutBullets/introInviteSMS in src/lib/sms.ts so the operator sees
// exactly what each recipient will get. Kept inline because sms.ts is
// server-only (imports crypto).
function aboutBullets(about: string): string {
  const lines = about
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
  return lines.map((l) => `- ${l}`).join(" ");
}

function previewText(
  toName: string,
  otherName: string,
  about: string,
  otherInstagram: string | null,
  blurb: string,
  operatorName: string,
): string {
  const bullets = aboutBullets(about);
  // Person.instagram is stored canonical (normalizeInstagram), so render as-is.
  const ig = otherInstagram?.trim() || null;
  return [
    `Hi ${first(toName)}, it's ${first(operatorName)} (your matchmaker).`,
    `I think you'd hit it off with ${first(otherName)}.`,
    bullets ? `A bit about them: ${bullets}.` : null,
    ig ? `Take a look: ${ig}.` : null,
    blurb.trim() ? blurb.trim() : null,
    `Want me to introduce you two? Reply Y for yes or N for no.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function IntroComposer({ people, operatorName }: { people: Person[]; operatorName: string }) {
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [aboutA, setAboutA] = useState("");
  const [aboutB, setAboutB] = useState("");
  const [blurb, setBlurb] = useState("");

  const a = useMemo(() => people.find((p) => p.id === aId), [people, aId]);
  const b = useMemo(() => people.find((p) => p.id === bId), [people, bId]);

  // Selecting a person seeds their "about" box from what we already know (bio /
  // what they're looking for), but only when the box is still empty, so the
  // operator never loses anything they typed.
  function selectPerson(side: "a" | "b", id: string) {
    const person = people.find((p) => p.id === id);
    const seed = (person?.blurb ?? "").trim();
    if (side === "a") {
      setAId(id);
      if (seed && !aboutA.trim()) setAboutA(seed);
    } else {
      setBId(id);
      if (seed && !aboutB.trim()) setAboutB(seed);
    }
  }

  const missingChannel =
    (a && !a.email && !(a.phone && a.canText) ? a.name : null) ||
    (b && !b.email && !(b.phone && b.canText) ? b.name : null);
  const sameTwice = aId && bId && aId === bId;
  const ready = a && b && !missingChannel && !sameTwice;

  return (
    <div className="card-feature p-5">
      <h2 className="font-display text-lg font-medium">New introduction</h2>
      <p className="mt-1 text-sm text-muted">
        Pick two approved people who are ready to match. Everyone gets an email invite when available.
        A text is added only for people who separately opted in to SMS.
      </p>

      <form
        action={createIntroduction}
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter sends without reaching for the mouse.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && ready) {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }
        }}
      >
        <PersonCombobox
          label="First person"
          name="personAId"
          people={people}
          value={aId}
          excludeId={bId}
          onChange={(id) => selectPerson("a", id)}
        />
        <PersonCombobox
          label="Second person"
          name="personBId"
          people={people}
          value={bId}
          excludeId={aId}
          onChange={(id) => selectPerson("b", id)}
        />

        <label className="block">
          <span className="label">
            About {a ? first(a.name) : "the first person"}
            {a && b ? ` (shown to ${first(b.name)})` : ""}
          </span>
          <textarea
            name="aboutA"
            value={aboutA}
            onChange={(e) => setAboutA(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={"Works in finance\nLives in Brooklyn\nLoves climbing"}
            className="field mt-1.5"
          />
          <span className="mt-1 block text-xs text-muted">One bullet per line.</span>
        </label>

        <label className="block">
          <span className="label">
            About {b ? first(b.name) : "the second person"}
            {a && b ? ` (shown to ${first(a.name)})` : ""}
          </span>
          <textarea
            name="aboutB"
            value={aboutB}
            onChange={(e) => setAboutB(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={"Runs a design studio\nGrew up in Chicago\nMarathoner"}
            className="field mt-1.5"
          />
          <span className="mt-1 block text-xs text-muted">One bullet per line.</span>
        </label>

        <label className="block sm:col-span-2">
          <span className="label">Optional one-liner (added after the bullets)</span>
          <textarea
            name="blurb"
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="You're both into climbing and just moved to Brooklyn - thought you'd click."
            className="field mt-1.5"
          />
        </label>

        {(a || b) && (
          <div className="sm:col-span-2 rounded-xl border border-line bg-paper/50 p-3">
            <p className="label mb-2 text-muted">Preview</p>
            <div className="space-y-2">
              {a && b && (
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">
                    To {first(a.name)} via {[a.email ? "email" : null, a.phone && a.canText ? "SMS" : null].filter(Boolean).join(" and ")}:
                  </span>{" "}
                  {a.phone && a.canText
                    ? previewText(a.name, b.name, aboutB, b.instagram, blurb, operatorName)
                    : `Email invite with ${first(b.name)}'s profile and Yes or Pass choices.`}
                </p>
              )}
              {a && b && (
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">
                    To {first(b.name)} via {[b.email ? "email" : null, b.phone && b.canText ? "SMS" : null].filter(Boolean).join(" and ")}:
                  </span>{" "}
                  {b.phone && b.canText
                    ? previewText(b.name, a.name, aboutA, a.instagram, blurb, operatorName)
                    : `Email invite with ${first(a.name)}'s profile and Yes or Pass choices.`}
                </p>
              )}
            </div>
          </div>
        )}

        {missingChannel && (
          <p className="sm:col-span-2 text-sm text-claret">
            {missingChannel} has no authorized delivery channel. Add an email or record explicit text consent.
          </p>
        )}

        <div className="sm:col-span-2">
          <button type="submit" disabled={!ready} className="btn-primary">
            Send introductions
          </button>
          <span className="ml-3 text-xs text-muted">or press Cmd/Ctrl + Enter</span>
        </div>
      </form>
    </div>
  );
}

// Typeahead person picker. Replaces a flat alphabetical <select> so the operator
// types 2-3 letters and hits Enter instead of scrolling a long roster. Writes the
// chosen id to a hidden input so the server action receives it unchanged.
function PersonCombobox({
  label,
  name,
  people,
  value,
  excludeId,
  onChange,
}: {
  label: string;
  name: string;
  people: Person[];
  value: string;
  excludeId?: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listboxId = useId();
  const selected = people.find((p) => p.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => p.id !== excludeId)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.city.toLowerCase().includes(q))
      .slice(0, 8);
  }, [people, query, excludeId]);

  // Show the chosen person's name when closed; typing reopens the search.
  const display = open ? query : selected ? `${selected.name} (${selected.city})` : "";

  function choose(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <label className="relative block">
      <span className="label">{label}</span>
      <input
        type="text"
        className="field mt-1.5"
        placeholder="Type a name..."
        value={display}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={open && filtered[active] ? `${listboxId}-${filtered[active].id}` : undefined}
        onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && filtered[active]) { e.preventDefault(); choose(filtered[active].id); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      <input type="hidden" name={name} value={value} />
      {open && filtered.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-panel py-1 shadow-card"
        >
          {filtered.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                id={`${listboxId}-${p.id}`}
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(p.id); }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === active ? "bg-cream" : ""}`}
              >
                <span className="text-ink">{p.name}</span>
                <span className="text-xs text-muted">{p.city}{p.phone ? "" : " · no phone"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
