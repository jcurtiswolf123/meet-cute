"use client";

import { useMemo, useState } from "react";
import { createIntroduction } from "@/lib/actions";

type Person = { id: string; name: string; phone: string | null; city: string; instagram: string | null; blurb?: string };

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

  const missingPhone =
    (a && !a.phone ? a.name : null) || (b && !b.phone ? b.name : null);
  const sameTwice = aId && bId && aId === bId;
  const ready = a && b && !missingPhone && !sameTwice;

  return (
    <div className="card p-5">
      <h2 className="font-display text-lg font-medium">New introduction</h2>
      <p className="mt-1 text-sm text-muted">
        Pick two people, add a few bullets about each, and text them both. They reply Y to opt in;
        when both say yes, you all land in one group thread together.
      </p>

      <form action={createIntroduction} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">First person</span>
          <select
            name="personAId"
            required
            value={aId}
            onChange={(e) => selectPerson("a", e.target.value)}
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
            onChange={(e) => selectPerson("b", e.target.value)}
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
                  <span className="font-medium">To {first(a.name)}:</span>{" "}
                  {previewText(a.name, b.name, aboutB, b.instagram, blurb, operatorName)}
                </p>
              )}
              {a && b && (
                <p className="text-sm leading-relaxed">
                  <span className="font-medium">To {first(b.name)}:</span>{" "}
                  {previewText(b.name, a.name, aboutA, a.instagram, blurb, operatorName)}
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
