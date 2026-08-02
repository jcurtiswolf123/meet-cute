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
};

function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// Which channels a person will actually be reached on. Email carries the whole
// profile; a text is only ever a nudge to the same page, and only with consent.
function channelsFor(p: Person): string {
  return [p.email ? "email" : null, p.phone && p.canText ? "text" : null].filter(Boolean).join(" and ");
}

export function IntroComposer({
  people,
  lockedAId,
  title = "New introduction",
  intro = "Pick two approved people who are ready to match. Each one gets the other's profile by email, in that person's own words. A text nudge is added only for people who separately opted in to SMS.",
}: {
  people: Person[];
  // When set, the first person is fixed (the profile the operator is standing
  // on) and only the second person is chosen. Used by the person page so an
  // operator can match someone with anyone on the roster, not just the ranked
  // suggestions.
  lockedAId?: string;
  title?: string;
  intro?: string;
}) {
  const locked = lockedAId ? people.find((p) => p.id === lockedAId) : undefined;
  const [aId, setAId] = useState(locked?.id ?? "");
  const [bId, setBId] = useState("");
  const [blurb, setBlurb] = useState("");

  const a = useMemo(() => people.find((p) => p.id === aId), [people, aId]);
  const b = useMemo(() => people.find((p) => p.id === bId), [people, bId]);

  const missingChannel =
    (a && !a.email && !(a.phone && a.canText) ? a.name : null) ||
    (b && !b.email && !(b.phone && b.canText) ? b.name : null);
  const sameTwice = aId && bId && aId === bId;
  const ready = a && b && !missingChannel && !sameTwice;

  return (
    <div className="card-feature p-5">
      <h2 className="font-sans tracking-[-0.012em] text-lg font-medium">{title}</h2>
      <p className="mt-1 text-sm text-muted">{intro}</p>

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
        {locked ? (
          <div className="block">
            <span className="label">First person</span>
            <div className="mt-1.5 flex items-center justify-between rounded-lg border border-line bg-studio-subtle px-3 py-2 text-sm">
              <span className="font-medium text-ink">{locked.name}</span>
              <span className="text-xs text-muted">{locked.city}</span>
            </div>
            <input type="hidden" name="personAId" value={locked.id} />
          </div>
        ) : (
          <PersonCombobox
            label="First person"
            name="personAId"
            people={people}
            value={aId}
            excludeId={bId}
            onChange={setAId}
          />
        )}
        <PersonCombobox
          label="Second person"
          name="personBId"
          people={people}
          value={bId}
          excludeId={aId}
          onChange={setBId}
        />

        <label className="block sm:col-span-2">
          <span className="label">Why this pairing (optional)</span>
          <textarea
            name="blurb"
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="You're both into climbing and just moved to Brooklyn - thought you'd click."
            className="field mt-1.5"
          />
          <span className="mt-1 block text-xs text-muted">
            Both people see this line. Write about the pairing, not about either person: they each
            introduce themselves through their own profile.
          </span>
        </label>

        {a && b && (
          <div className="sm:col-span-2 rounded-xl border border-line bg-studio-subtle p-3">
            <p className="label mb-2 text-muted">What goes out</p>
            <div className="space-y-2">
              <p className="text-sm leading-relaxed">
                <span className="font-medium">To {first(a.name)} via {channelsFor(a)}:</span>{" "}
                {first(b.name)}&rsquo;s profile as {first(b.name)} wrote it, with Yes or Pass.
              </p>
              <p className="text-sm leading-relaxed">
                <span className="font-medium">To {first(b.name)} via {channelsFor(b)}:</span>{" "}
                {first(a.name)}&rsquo;s profile as {first(a.name)} wrote it, with Yes or Pass.
              </p>
              {blurb.trim() && (
                <p className="text-sm leading-relaxed text-muted">
                  Both also see your note: &ldquo;{blurb.trim()}&rdquo;
                </p>
              )}
            </div>
          </div>
        )}

        {missingChannel && (
          <p className="sm:col-span-2 text-sm text-ink">
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
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === active ? "bg-studio-canvas" : ""}`}
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
