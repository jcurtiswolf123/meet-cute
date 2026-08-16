"use client";

import { useMemo, useState } from "react";
import { createIntroduction } from "@/lib/actions";
import { Avatar } from "@/components/ui";
import { FaceWall, type FacePerson } from "@/components/FaceWall";
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
  // One ordered list rather than two ids. Two adjacent clicks on the wall land
  // inside the same React batch, and with a state per slot the second one read
  // the first one's stale value and overwrote it: picking two faces quickly
  // left one picked. Every write here is a function of the list itself.
  const slots = locked ? 1 : 2;
  const [picked, setPicked] = useState<string[]>(defaultBId ? [defaultBId] : []);
  const [blurb, setBlurb] = useState("");

  // A link that arrives with a candidate already chosen ("Introduce" in the
  // suggested-candidates list) changes the selection without remounting the
  // composer. Adjusting during render rather than in an effect: React applies it
  // before anything is painted, so the picker never flashes the old choice.
  const [lastDefaultBId, setLastDefaultBId] = useState(defaultBId);
  if (defaultBId !== lastDefaultBId) {
    setLastDefaultBId(defaultBId);
    if (defaultBId) {
      setPicked((current) =>
        current.includes(defaultBId)
          ? current
          : [...current.slice(0, slots - 1), defaultBId],
      );
    }
  }

  const aId = locked ? locked.id : (picked[0] ?? "");
  const bId = locked ? (picked[0] ?? "") : (picked[1] ?? "");

  const a = useMemo(() => people.find((p) => p.id === aId), [people, aId]);
  const b = useMemo(() => people.find((p) => p.id === bId), [people, bId]);

  // The wall the two people are picked off. Everyone but whoever is already
  // fixed in the first slot, drawn as a face with the line that decides a
  // match: what that person is looking for.
  const wallPeople: FacePerson[] = useMemo(
    () =>
      people
        .filter((p) => p.id !== locked?.id)
        .map((p) => ({
          id: p.id,
          name: p.name,
          photoUrl: p.photoUrl,
          meta: p.city,
          note: p.lookingFor,
        })),
    [people, locked?.id],
  );

  // What already stands between the person in the first slot and everyone on
  // the wall, drawn on the tile before the click rather than reported after the
  // send is refused. Only meaningful once there is somebody to compare against.
  const pivotId = locked?.id ?? aId;
  const { unavailable, caution } = useMemo(() => {
    const unavailable: Record<string, string> = {};
    const caution: Record<string, string> = {};
    for (const p of wallPeople) {
      const person = people.find((x) => x.id === p.id);
      if (person && !hasChannel(person)) {
        unavailable[p.id] = "No email or text on file";
        continue;
      }
      if (!pivotId || p.id === pivotId) continue;
      const state = pairs?.[pairKey(pivotId, p.id)];
      if (state === "blocked") unavailable[p.id] = "Blocked";
      else if (state === "open") unavailable[p.id] = "Introduction already out";
      else if (state === "connected") caution[p.id] = "Introduced before";
    }
    return { unavailable, caution };
  }, [wallPeople, people, pairs, pivotId]);

  function toggle(id: string) {
    setPicked((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id);
      if (current.length >= slots) return current;
      return [...current, id];
    });
  }

  const drop = (id: string) => setPicked((current) => current.filter((x) => x !== id));

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
          {step(
            1,
            locked
              ? `Who to introduce ${first(locked.name)} to`
              : picked.length === 0
                ? "Pick two faces"
                : picked.length === 1
                  ? "Pick the second face"
                  : "Who is meeting whom",
          )}

          {/* The pair, at the size a pairing is judged at. Picking used to be
              two typeahead fields, so the operator held both people in their
              head and read a name to check the choice. */}
          {/* Two slots side by side. They used to `flex-wrap`, which on a phone
              broke to one slot per line with the "+" left hanging off the end of
              the first, reading as part of it. A grid keeps the pairing legible
              at any width: the two slots share the row and the "+" sits between
              them. */}
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
            <Slot
              person={locked ?? a}
              label="First person"
              onClear={locked || !aId ? undefined : () => drop(aId)}
            />
            <span className="text-lg text-muted" aria-hidden="true">
              +
            </span>
            <Slot person={b} label="Second person" onClear={bId ? () => drop(bId) : undefined} />
          </div>
          <input type="hidden" name="personAId" value={locked?.id ?? aId} />
          <input type="hidden" name="personBId" value={bId} />

          <div className="mt-3">
            <FaceWall
              people={wallPeople}
              selected={picked}
              onToggle={toggle}
              unavailable={unavailable}
              caution={caution}
              max={slots}
              ordered={!locked}
              ariaLabel="People to introduce"
              searchPlaceholder="Filter by name, city, what they want..."
              emptyText="Nobody is marked ready to match. Open a profile and mark them ready."
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

/** One half of the pair, drawn as a face, or an empty frame waiting for one. */
function Slot({
  person,
  label,
  onClear,
}: {
  person?: Person;
  label: string;
  onClear?: () => void;
}) {
  if (!person) {
    return (
      <div className="flex h-[3.75rem] w-full min-w-0 items-center gap-2.5 rounded-lg border border-dashed border-line px-3 text-sm text-muted sm:w-48">
        {label}
      </div>
    );
  }
  return (
    <div className="flex h-[3.75rem] w-full min-w-0 items-center gap-2.5 rounded-lg border border-studio-line bg-studio-subtle px-3 sm:w-48">
      <Avatar url={person.photoUrl} name={person.name} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{person.name}</span>
        <span className="block truncate text-xs text-muted">{person.city}</span>
      </span>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label.toLowerCase()}`}
          className="flex-none rounded-full px-1.5 py-1 text-xs text-muted hover:text-ink"
        >
          ✕
        </button>
      )}
    </div>
  );
}
