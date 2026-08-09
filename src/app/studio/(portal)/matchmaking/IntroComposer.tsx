"use client";

import { useId, useMemo, useState } from "react";
import { createIntroduction } from "@/lib/actions";
import { Avatar } from "@/components/ui";
import { pairKey, type PairState } from "@/lib/pairs";

type Person = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  canText: boolean;
  city: string;
  photoUrl?: string | null;
  lookingFor?: string | null;
};

function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// Which channels a person will actually be reached on. Email carries the whole
// profile; a text is only ever a nudge to the same page, and only with consent.
function channelsFor(p: Person): string {
  return [p.email ? "email" : null, p.phone && p.canText ? "text" : null].filter(Boolean).join(" and ");
}

function hasChannel(p: Person): boolean {
  return !!p.email || !!(p.phone && p.canText);
}

export function IntroComposer({
  people,
  lockedAId,
  defaultBId,
  pairs,
  returnTo,
  notice,
  title = "New introduction",
  intro = "Pick two people, say why, and send. Each one gets the other's profile by email, in that person's own words. Nobody is connected until they both say yes.",
}: {
  people: Person[];
  // When set, the first person is fixed (the profile the operator is standing
  // on) and only the second person is chosen. Used by the person page so an
  // operator can match someone with anyone on the roster, not just the ranked
  // suggestions.
  lockedAId?: string;
  // Preselects the second person. The person page's candidate list links here
  // with a candidate already chosen, so "introduce this suggestion" is one
  // click instead of retyping a name into the search box.
  defaultBId?: string;
  // Pair state by `pairKey`, so an open introduction, a previous connection, or
  // a block is reported at pick time instead of after the send is refused.
  pairs?: Record<string, PairState>;
  // The studio path this composer lives on. The action redirects back here with
  // the outcome, so a refused introduction reports itself in place instead of
  // throwing the operator onto the generic error page.
  returnTo: string;
  notice?: string;
  title?: string;
  intro?: string;
}) {
  const locked = lockedAId ? people.find((p) => p.id === lockedAId) : undefined;
  const [aId, setAId] = useState(locked?.id ?? "");
  const [bId, setBId] = useState(defaultBId ?? "");
  const [blurb, setBlurb] = useState("");

  // A link that arrives with a candidate already chosen ("Introduce" in the
  // suggested-candidates list) changes the selection without remounting the
  // composer. Adjusting during render rather than in an effect: React applies it
  // before anything is painted, so the picker never flashes the old choice.
  const [lastDefaultBId, setLastDefaultBId] = useState(defaultBId);
  if (defaultBId !== lastDefaultBId) {
    setLastDefaultBId(defaultBId);
    if (defaultBId) setBId(defaultBId);
  }

  const a = useMemo(() => people.find((p) => p.id === aId), [people, aId]);
  const b = useMemo(() => people.find((p) => p.id === bId), [people, bId]);

  const missingChannel = (a && !hasChannel(a) ? a.name : null) || (b && !hasChannel(b) ? b.name : null);
  const sameTwice = !!aId && aId === bId;
  const pairState = a && b && !sameTwice ? pairs?.[pairKey(a.id, b.id)] : undefined;
  const blocking = pairState === "open" || pairState === "blocked";
  const ready = !!a && !!b && !missingChannel && !sameTwice && !blocking;

  const step = (n: number, text: string) => (
    <span className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-ink/30 text-[10px] font-semibold tabular-nums text-ink">
        {n}
      </span>
      <span className="label !mb-0">{text}</span>
    </span>
  );

  return (
    <div className="card-feature p-5">
      <h2 className="font-sans tracking-[-0.012em] text-lg font-medium">{title}</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">{intro}</p>

      {notice && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-studio-line bg-studio-subtle px-3 py-2 text-sm text-ink"
        >
          {notice}
        </p>
      )}

      <form
        action={createIntroduction}
        className="mt-4 space-y-5"
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter sends without reaching for the mouse.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && ready) {
            e.preventDefault();
            e.currentTarget.requestSubmit();
          }
        }}
      >
        <input type="hidden" name="returnTo" value={returnTo} />

        <div>
          {step(1, locked ? `Who to introduce ${first(locked.name)} to` : "Who is meeting whom")}
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {locked ? (
              <div className="block">
                <span className="label">First person</span>
                <div className="mt-1.5 flex items-center gap-2.5 rounded-lg border border-line bg-studio-subtle px-3 py-2 text-sm">
                  <Avatar url={locked.photoUrl} name={locked.name} size={28} />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{locked.name}</span>
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
          </div>
        </div>

        <div>
          {step(2, "Why these two (optional)")}
          <label className="mt-2 block">
            <span className="sr-only">Why this pairing</span>
            <textarea
              name="blurb"
              value={blurb}
              onChange={(e) => setBlurb(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="You're both into climbing and just moved to Brooklyn - thought you'd click."
              className="field"
            />
            <span className="mt-1 block text-xs text-muted">
              Both people see this line. Write about the pairing, not about either person: they each
              introduce themselves through their own profile.
            </span>
          </label>
        </div>

        <div>
          {step(3, "Send")}
          <div className="mt-2 space-y-3">
            {a && b && !sameTwice && (
              <div className="rounded-xl border border-line bg-studio-subtle p-3">
                <p className="label mb-2 text-muted">What goes out</p>
                <div className="space-y-2">
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium">To {first(a.name)} via {channelsFor(a) || "no channel"}:</span>{" "}
                    {first(b.name)}&rsquo;s profile as {first(b.name)} wrote it, with Yes or Pass.
                  </p>
                  <p className="text-sm leading-relaxed">
                    <span className="font-medium">To {first(b.name)} via {channelsFor(b) || "no channel"}:</span>{" "}
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

            {!a || !b ? (
              <p className="text-sm text-muted">Pick two people to see exactly what each of them receives.</p>
            ) : null}

            {sameTwice && <Warning>That is the same person twice. Pick someone else for the second slot.</Warning>}

            {missingChannel && (
              <Warning>
                {missingChannel} has no authorized delivery channel. Add an email or record explicit text consent.
              </Warning>
            )}

            {pairState === "blocked" && a && b && (
              <Warning>
                {first(a.name)} and {first(b.name)} cannot be introduced. One of them blocked the other.
              </Warning>
            )}

            {pairState === "open" && a && b && (
              <Warning>
                {first(a.name)} and {first(b.name)} already have an introduction out and unanswered. Resend
                it from the Introductions board rather than starting a second one.
              </Warning>
            )}

            {pairState === "connected" && a && b && (
              <p className="text-sm text-muted">
                Heads up: {first(a.name)} and {first(b.name)} have been introduced before. Sending starts a
                fresh introduction.
              </p>
            )}

            <div>
              <button type="submit" disabled={!ready} className="btn-primary">
                {a && b && ready ? `Introduce ${first(a.name)} and ${first(b.name)}` : "Send introductions"}
              </button>
              <span className="ml-3 text-xs text-muted">or press Cmd/Ctrl + Enter</span>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-ink/25 bg-studio-canvas px-3 py-2 text-sm text-ink">{children}</p>
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
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.city.toLowerCase().includes(q) ||
          (p.lookingFor ?? "").toLowerCase().includes(q),
      )
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
    <div className="relative block">
      <label className="block">
        <span className="label">{label}</span>
        <input
          type="text"
          className="field mt-1.5"
          placeholder="Type a name, city, or what they want..."
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
      </label>
      <input type="hidden" name={name} value={value} />
      {selected && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-[2.1rem] rounded-full px-2 py-1 text-xs text-muted hover:text-ink"
          aria-label={`Clear ${label.toLowerCase()}`}
        >
          Clear
        </button>
      )}
      {open && filtered.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-line bg-panel py-1 shadow-card"
        >
          {filtered.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                id={`${listboxId}-${p.id}`}
                type="button"
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(p.id); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${i === active ? "bg-studio-canvas" : ""}`}
              >
                {/* A face and a line about what they want. A name and a city was
                    not enough to pick the second person without opening two
                    profiles in other tabs first. */}
                <Avatar url={p.photoUrl} name={p.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{p.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {p.city}
                    {p.lookingFor ? ` · ${p.lookingFor}` : ""}
                  </span>
                </span>
                {!hasChannel(p) && <span className="flex-none text-xs text-ink">no channel</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <p className="absolute z-20 mt-1 w-full rounded-lg border border-line bg-panel px-3 py-2 text-xs text-muted shadow-card">
          Nobody matches that. Try a first name, or a city.
        </p>
      )}
    </div>
  );
}
