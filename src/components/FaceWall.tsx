"use client";

import { useMemo, useState } from "react";
import { photoAt } from "@/lib/photo-url";

/**
 * A wall of faces you pick from.
 *
 * The applicant wall proved the shape: a decision about a person is made from
 * the person's face, at the size the decision needs, in the same view the
 * action lives in. Every other picker in the studio was a name in a dropdown or
 * a 32px avatar beside a checkbox, which is a decision made from text about
 * somebody you are looking at.
 *
 * This is that wall, without the applicant-specific verdict buttons: a filter,
 * a grid of portraits, and a selection the parent owns. Whoever renders it
 * writes the hidden inputs, so it drops into a server action form unchanged.
 */

export type FacePerson = {
  id: string;
  name: string;
  photoUrl?: string | null;
  /** City or neighbourhood. Drawn over the face. */
  meta?: string | null;
  /** What they want, or a headline. Drawn under the face, two lines at most. */
  note?: string | null;
};

export function FaceWall({
  people,
  selected,
  onToggle,
  /** id -> why this person cannot be picked. Dimmed, inert, reason on the tile. */
  unavailable,
  /** id -> a caution that still allows the pick. Drawn, not enforced. */
  caution,
  /** Ordered selection past this count is refused. Undefined means no ceiling. */
  max,
  searchPlaceholder = "Filter by name, city, what they want...",
  emptyText = "Nobody here.",
  /** Show the numbered order of a selection rather than a plain check. */
  ordered = false,
  ariaLabel,
}: {
  people: FacePerson[];
  selected: string[];
  onToggle: (id: string) => void;
  unavailable?: Record<string, string>;
  caution?: Record<string, string>;
  max?: number;
  searchPlaceholder?: string;
  emptyText?: string;
  ordered?: boolean;
  ariaLabel?: string;
}) {
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      `${p.name} ${p.meta ?? ""} ${p.note ?? ""}`.toLowerCase().includes(q),
    );
  }, [people, query]);

  const full = max !== undefined && selected.length >= max;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={ariaLabel ?? "Filter people"}
          className="field h-8 max-w-xs !py-1 text-sm"
        />
        <span className="text-xs text-muted">
          {shown.length} {shown.length === 1 ? "person" : "people"}
          {selected.length > 0 ? ` · ${selected.length} picked` : ""}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{emptyText}</p>
      ) : (
        <ul
          className="mt-3 grid max-h-[26rem] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-6"
          role="listbox"
          aria-label={ariaLabel ?? "People"}
          aria-multiselectable={max !== 1}
        >
          {shown.map((person) => {
            const order = selected.indexOf(person.id);
            const isPicked = order >= 0;
            const blocked = unavailable?.[person.id];
            // A wall that goes inert the moment it is full cannot be corrected
            // without first hunting down the tile to unpick, so a picked tile
            // always stays live.
            const inert = !isPicked && (!!blocked || full);
            const warn = caution?.[person.id];

            return (
              <li key={person.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isPicked}
                  disabled={inert}
                  onClick={() => onToggle(person.id)}
                  title={blocked ?? warn ?? undefined}
                  className={`group relative block w-full overflow-hidden rounded-lg border text-left transition ${
                    isPicked
                      ? "border-ink ring-2 ring-ink"
                      : "border-studio-line hover:border-ink/40"
                  } ${
                    blocked && !isPicked
                      ? "cursor-not-allowed opacity-40"
                      : inert
                        ? // Only the ceiling is in the way, and the fix is to
                          // unpick somebody, so this stays legible rather than
                          // greying out the whole wall behind the two choices.
                          "cursor-default opacity-70"
                        : "cursor-pointer"
                  }`}
                >
                  <span className="relative block aspect-[4/5] w-full overflow-hidden bg-studio-subtle">
                    {person.photoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- proxied member upload */
                      <img
                        src={photoAt(person.photoUrl, 384)}
                        alt={person.name}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover transition duration-200 ease-soft group-hover:scale-[1.02] motion-reduce:transition-none"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[11px] text-muted">
                        No photo
                      </span>
                    )}

                    {isPicked && (
                      <span className="absolute left-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[10px] font-semibold tabular-nums text-white">
                        {ordered ? order + 1 : "✓"}
                      </span>
                    )}

                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent px-2 pb-1.5 pt-6">
                      <span className="block truncate text-xs font-medium text-white">
                        {person.name}
                      </span>
                      {person.meta && (
                        <span className="block truncate text-[10px] text-white/75">{person.meta}</span>
                      )}
                    </span>
                  </span>

                  {(blocked || warn || person.note) && (
                    <span className="block px-2 py-1.5">
                      <span
                        // No `block` here: line-clamp needs -webkit-box, and a
                        // display utility after it wins, so the note ran to
                        // five lines in a narrow column and the tiles in a row
                        // stopped lining up.
                        className={`line-clamp-2 text-[10px] leading-snug ${
                          blocked || warn ? "text-ink" : "text-muted"
                        }`}
                      >
                        {blocked ?? warn ?? person.note}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
