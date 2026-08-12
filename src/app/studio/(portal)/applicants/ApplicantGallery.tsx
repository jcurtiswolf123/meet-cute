"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { setMemberStatus } from "@/lib/actions";
import { ConfirmActionForm } from "@/components/forms";
import { ApproveApplicant } from "../ApproveApplicant";

export type GalleryPerson = {
  id: string;
  name: string;
  age: number | null;
  cities: string;
  neighborhood: string | null;
  email: string | null;
  headline: string | null;
  lookingFor: string | null;
  photos: { id: string; url: string }[];
  /** "Applied 3 days ago", "Started yesterday, chased". Empty for the roster. */
  when: string;
  /** Whether Approve and Decline apply to this person at all. */
  decidable: boolean;
  /** Friends asked who have not written. Drives the override prompt. */
  outstanding: number;
  gate: string;
  recommendations: { id: string; name: string; body: string | null; relationship: string | null }[];
};

type TabKey = "review" | "stalled" | "roster";

const TAB_LABEL: Record<TabKey, string> = {
  review: "To review",
  stalled: "Stopped at friends",
  roster: "Members",
};

/**
 * The wall of faces.
 *
 * Judging whether a photo is really the applicant was being done from a 32px
 * avatar in a list, and seeing somebody's other photos meant opening their
 * profile, scrolling to the photo block, expanding one, and coming back. This
 * is the same review at the size the decision needs: every applicant as a
 * portrait, every photo they uploaded one arrow key away, and Approve and
 * Decline in the same view so the operator never leaves the wall to act.
 */
export function ApplicantGallery({
  review,
  stalled,
  roster,
}: {
  review: GalleryPerson[];
  stalled: GalleryPerson[];
  roster: GalleryPerson[];
}) {
  const [tab, setTab] = useState<TabKey>(review.length > 0 ? "review" : "roster");
  const [query, setQuery] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const source = tab === "review" ? review : tab === "stalled" ? stalled : roster;
  const q = query.trim().toLowerCase();
  const people = useMemo(
    () =>
      q
        ? source.filter((p) =>
            `${p.name} ${p.cities} ${p.neighborhood ?? ""} ${p.email ?? ""} ${p.headline ?? ""}`
              .toLowerCase()
              .includes(q),
          )
        : source,
    [source, q],
  );

  // Approving somebody removes them from the list under the open view, and
  // filtering can empty it outright. Clamped as it is read, so the overlay
  // never points at a person who is no longer there.
  const shownIndex =
    openIndex === null || people.length === 0 ? null : Math.min(openIndex, people.length - 1);

  const counts: Record<TabKey, number> = {
    review: review.length,
    stalled: stalled.length,
    roster: roster.length,
  };

  return (
    <div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-studio-line">
          {(Object.keys(TAB_LABEL) as TabKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setOpenIndex(null);
              }}
              aria-pressed={tab === key}
              className={`border-r border-studio-line px-3 py-1.5 text-xs font-medium transition last:border-r-0 ${
                tab === key ? "bg-ink text-white" : "bg-studio-panel text-muted hover:text-ink"
              }`}
            >
              {TAB_LABEL[key]}
              <span className={tab === key ? "ml-1.5 text-white/70" : "ml-1.5 text-muted"}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>
        <input
          data-studio-search
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name, city, email..."
          aria-label="Filter applicants"
          className="field h-8 max-w-xs !py-1 text-sm"
        />
        <span className="text-xs text-muted">
          {people.length} {people.length === 1 ? "person" : "people"}
          {q ? ` matching "${query.trim()}"` : ""}
        </span>
      </div>

      {people.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          {tab === "review"
            ? "Nobody is waiting on a decision."
            : tab === "stalled"
              ? "Nobody is half-finished."
              : "No members yet."}
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {people.map((person, index) => (
            <li
              key={person.id}
              className="overflow-hidden rounded-lg border border-studio-line bg-studio-panel"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(index)}
                aria-label={`Open ${person.name} full size`}
                className="group relative block aspect-[4/5] w-full cursor-zoom-in overflow-hidden bg-studio-subtle"
              >
                {person.photos[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- proxied member upload */
                  <img
                    src={person.photos[0].url}
                    alt={person.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition duration-200 ease-soft group-hover:scale-[1.02] motion-reduce:transition-none"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs text-muted">
                    No photo
                  </span>
                )}
                {person.photos.length > 1 && (
                  <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {person.photos.length}
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent px-3 pb-2.5 pt-8 text-left">
                  <span className="block truncate text-sm font-medium text-white">
                    {person.name}
                    {person.age ? `, ${person.age}` : ""}
                  </span>
                  <span className="block truncate text-[11px] text-white/75">
                    {person.cities}
                    {person.when ? ` · ${person.when}` : ""}
                  </span>
                </span>
              </button>

              <div className="flex flex-col gap-2 p-2.5">
                {person.gate && (
                  <p className="text-[11px] leading-snug text-muted">{person.gate}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {person.decidable ? (
                    <>
                      <ApproveApplicant
                        personId={person.id}
                        name={person.name}
                        outstanding={person.outstanding}
                      />
                      <ConfirmActionForm
                        action={setMemberStatus}
                        confirmMessage={`Decline ${person.name.split(" ")[0]}?`}
                        triggerLabel="Decline"
                        triggerAriaLabel={`Decline ${person.name}`}
                        confirmLabel="Decline"
                        pendingText="..."
                        buttonClassName="rounded-full border border-line px-3 py-1 text-xs"
                      >
                        <input type="hidden" name="personId" value={person.id} />
                        <input type="hidden" name="action" value="decline" />
                      </ConfirmActionForm>
                    </>
                  ) : null}
                  <Link
                    href={`/studio/person/${person.id}`}
                    className="text-xs text-muted underline underline-offset-2 hover:text-ink"
                  >
                    Profile
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {shownIndex !== null && people[shownIndex] && (
        <Reviewer
          people={people}
          index={shownIndex}
          onIndex={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  );
}

/**
 * One applicant, full screen. Left and right move through their photos, up and
 * down through the people, and the decision is on the same screen as the face.
 */
function Reviewer({
  people,
  index,
  onIndex,
  onClose,
}: {
  people: GalleryPerson[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const person = people[index];
  // Which photo, and whose. Keyed by person so moving to the next applicant
  // starts at their first photo rather than at photo four of the person before
  // them, without an effect resetting it after the wrong one has painted.
  const [seen, setSeen] = useState<{ personId: string; index: number }>({
    personId: person.id,
    index: 0,
  });
  const photo = seen.personId === person.id ? seen.index : 0;
  const setPhoto = useCallback(
    (next: number | ((current: number) => number)) =>
      setSeen((state) => {
        const current = state.personId === person.id ? state.index : 0;
        return {
          personId: person.id,
          index: typeof next === "function" ? next(current) : next,
        };
      }),
    [person.id],
  );
  const closeButton = useRef<HTMLButtonElement | null>(null);
  const touchStartX = useRef<number | null>(null);

  const stepPerson = useCallback(
    (delta: number) => onIndex((index + delta + people.length) % people.length),
    [index, onIndex, people.length],
  );

  const stepPhoto = useCallback(
    (delta: number) => {
      const count = person.photos.length;
      if (count < 2) return;
      setPhoto((current) => (current + delta + count) % count);
    },
    [person.photos.length, setPhoto],
  );

  useEffect(() => {
    closeButton.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // The override prompt is a text field inside this overlay. Arrow keys
      // belong to whoever is typing.
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        case "ArrowRight":
          event.preventDefault();
          stepPhoto(1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          stepPhoto(-1);
          break;
        case "ArrowDown":
        case "j":
          event.preventDefault();
          stepPerson(1);
          break;
        case "ArrowUp":
        case "k":
          event.preventDefault();
          stepPerson(-1);
          break;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, stepPhoto, stepPerson]);

  const current = person.photos[photo];

  // On <body>: the gallery grid builds stacking contexts of its own, and an
  // overlay left inside one paints under the page it is covering.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${person.name}, ${index + 1} of ${people.length}`}
      className="animate-lightbox-in fixed inset-0 z-50 flex flex-col bg-ink"
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.clientX ?? null;
        touchStartX.current = null;
        if (start === null || end === null) return;
        if (Math.abs(end - start) > 48) stepPhoto(end < start ? 1 : -1);
      }}
    >
      <div className="flex items-start justify-between gap-4 px-4 py-3 text-white sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-base font-medium">
            {person.name}
            {person.age ? `, ${person.age}` : ""}
          </p>
          <p className="truncate text-xs text-white/70">
            {[person.cities, person.neighborhood, person.email, person.when]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-xs text-white/60 sm:block">
            {index + 1} of {people.length}
          </span>
          <Link
            href={`/studio/person/${person.id}`}
            className="rounded-full border border-white/30 px-3 py-1 text-xs text-white transition hover:bg-white/10"
          >
            Profile
          </Link>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-white/30 px-3 py-1 text-xs text-white transition hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
        {current ? (
          /* eslint-disable-next-line @next/next/no-img-element -- proxied member upload */
          <img
            src={current.url}
            alt={`${person.name}, photo ${photo + 1} of ${person.photos.length}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="text-sm text-white/60">This person has no photo.</p>
        )}

        {person.photos.length > 1 && (
          <>
            <ReviewerArrow side="left" onClick={() => stepPhoto(-1)} />
            <ReviewerArrow side="right" onClick={() => stepPhoto(1)} />
          </>
        )}
      </div>

      <div className="space-y-3 px-4 py-3 sm:px-6">
        {person.photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {person.photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPhoto(i)}
                aria-label={`Photo ${i + 1}`}
                aria-current={i === photo}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded border transition ${
                  i === photo ? "border-white" : "border-white/25 opacity-60 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- proxied member upload */}
                <img src={p.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {(person.headline || person.lookingFor) && (
          <p className="max-w-3xl text-xs leading-relaxed text-white/70">
            {[person.headline, person.lookingFor].filter(Boolean).join(" · ")}
          </p>
        )}

        {person.recommendations.length > 0 && (
          <div className="max-w-3xl space-y-1.5">
            {person.recommendations.map((rec) => (
              <p key={rec.id} className="text-xs leading-relaxed text-white/75">
                <span className="font-medium text-white">{rec.name}</span>
                {rec.relationship ? ` (${rec.relationship})` : ""}
                {rec.body ? `: "${rec.body}"` : ""}
              </p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {person.gate && <span className="text-xs text-white/70">{person.gate}</span>}
          {person.decidable && (
            <span className="flex flex-wrap items-center gap-2 [&_.field]:bg-white [&_.field]:text-ink">
              <ApproveApplicant
                personId={person.id}
                name={person.name}
                outstanding={person.outstanding}
                tone="dark"
              />
              <ConfirmActionForm
                action={setMemberStatus}
                confirmMessage={`Decline ${person.name.split(" ")[0]}?`}
                triggerLabel="Decline"
                triggerAriaLabel={`Decline ${person.name}`}
                confirmLabel="Decline"
                pendingText="..."
                buttonClassName="rounded-full border border-white/40 px-3 py-1 text-xs text-white"
                messageClassName="text-white/70"
                cancelClassName="rounded-full border border-white/40 px-3 py-1 text-xs text-white"
              >
                <input type="hidden" name="personId" value={person.id} />
                <input type="hidden" name="action" value="decline" />
              </ConfirmActionForm>
            </span>
          )}
          <span className="ml-auto text-[11px] text-white/50">
            Left and right for photos, up and down for people, Escape to close.
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ReviewerArrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full border border-white/30 px-3 py-2 text-white transition hover:bg-white/10 ${
        side === "left" ? "left-2" : "right-2"
      }`}
    >
      {side === "left" ? "←" : "→"}
    </button>
  );
}
