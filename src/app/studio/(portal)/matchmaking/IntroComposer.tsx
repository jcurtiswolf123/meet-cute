"use client";

import { useMemo, useState } from "react";
import { createIntroduction } from "@/lib/actions";

type Person = { id: string; name: string; phone: string | null; city: string };

function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// Mirrors introInviteSMS in src/lib/sms.ts so the operator sees exactly what the
// recipient will get. Kept inline because sms.ts is server-only (imports crypto).
function previewText(toName: string, otherName: string, blurb: string, operatorName: string): string {
  return [
    `Hi ${first(toName)}, it's ${first(operatorName)} (your matchmaker).`,
    `I think you'd really hit it off with ${first(otherName)}.`,
    blurb.trim() ? blurb.trim() : null,
    `Want me to introduce you two? Reply Y for yes or N for no.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export function IntroComposer({ people, operatorName }: { people: Person[]; operatorName: string }) {
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [blurb, setBlurb] = useState("");

  const a = useMemo(() => people.find((p) => p.id === aId), [people, aId]);
  const b = useMemo(() => people.find((p) => p.id === bId), [people, bId]);

  const missingPhone =
    (a && !a.phone ? a.name : null) || (b && !b.phone ? b.name : null);
  const sameTwice = aId && bId && aId === bId;
  const ready = a && b && !missingPhone && !sameTwice;

  return (
    <div className="card p-5">
      <h2 className="font-display text-lg font-medium">New introduction</h2>
      <p className="mt-1 text-sm text-muted">
        Pick two people, add a one-line reason, and text them both. They reply Y to opt in; when both
        say yes, they each get the other&apos;s number automatically.
      </p>

      <form action={createIntroduction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">First person</span>
          <select
            name="personAId"
            required
            value={aId}
            onChange={(e) => setAId(e.target.value)}
            className="field mt-1.5"
          >
            <option value="" disabled>
              Choose a person
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id} disabled={p.id === bId}>
                {p.name} ({p.city}){p.phone ? "" : " - no phone"}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label">Second person</span>
          <select
            name="personBId"
            required
            value={bId}
            onChange={(e) => setBId(e.target.value)}
            className="field mt-1.5"
          >
            <option value="" disabled>
              Choose a person
            </option>
            {people.map((p) => (
              <option key={p.id} value={p.id} disabled={p.id === aId}>
                {p.name} ({p.city}){p.phone ? "" : " - no phone"}
              </option>
            ))}
          </select>
        </label>

        <label className="block sm:col-span-2">
          <span className="label">Why they&apos;d hit it off (sent in the text)</span>
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
                  <span className="font-medium">To {first(a.name)}:</span>{" "}
                  {previewText(a.name, b.name, blurb, operatorName)}
                </p>
              )}
              {a && b && (
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">To {first(b.name)}:</span>{" "}
                  {previewText(b.name, a.name, blurb, operatorName)}
                </p>
              )}
            </div>
          </div>
        )}

        {missingPhone && (
          <p className="sm:col-span-2 text-sm text-claret">
            {missingPhone} has no phone number on file. Add one before texting an intro.
          </p>
        )}

        <div className="sm:col-span-2">
          <button type="submit" disabled={!ready} className="btn-primary disabled:opacity-40">
            Send intro texts
          </button>
        </div>
      </form>
    </div>
  );
}
