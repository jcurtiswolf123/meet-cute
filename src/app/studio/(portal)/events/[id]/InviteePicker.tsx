"use client";

import { useState } from "react";
import { addEventInvitees } from "@/lib/actions";
import { FaceWall, type FacePerson } from "@/components/FaceWall";
import { SubmitButton } from "@/components/forms";

/**
 * Who is coming to dinner, picked by face.
 *
 * A dinner is a room, and a room is chosen by looking at who is in it. This was
 * a scrolling box of checkboxes with a 32px avatar beside each name, which is
 * the roster read as a list of strings while the actual judgement (does this
 * table work together) is visual. Same server action, same `memberId` fields.
 */
export function InviteePicker({
  dinnerId,
  people,
  seatsLeft,
}: {
  dinnerId: string;
  people: FacePerson[];
  seatsLeft: number;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }

  const over = seatsLeft >= 0 && selected.length > seatsLeft;

  return (
    <form action={addEventInvitees} className="mt-4">
      <input type="hidden" name="dinnerId" value={dinnerId} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="memberId" value={id} />
      ))}

      <FaceWall
        people={people}
        selected={selected}
        onToggle={toggle}
        ariaLabel="Members who can be invited"
        searchPlaceholder="Filter by name, neighbourhood, what they do..."
        emptyText="Everyone eligible is already on the list."
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SubmitButton className="btn-primary" pendingText="Adding..." disabled={selected.length === 0}>
          {selected.length === 0
            ? "Add & email selected"
            : `Add ${selected.length} & email them`}
        </SubmitButton>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-xs text-muted underline underline-offset-2 hover:text-ink"
          >
            Clear
          </button>
        )}
        {over && (
          <span className="text-xs text-ink">
            That is {selected.length - seatsLeft} more than the {seatsLeft === 1 ? "seat" : "seats"} left.
          </span>
        )}
      </div>
    </form>
  );
}
