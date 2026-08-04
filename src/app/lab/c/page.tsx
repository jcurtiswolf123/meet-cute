"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/ui";
import { ChoiceGroup, Checkbox } from "@/components/fields";
import { CITIES } from "@/lib/cities";

// C. One page, honest about what is missing.
//
// The theory: the page is not too long, it is dishonest about its own order.
// The two things that actually decide whether someone gets in, a photo and two
// friends, are at the bottom and the top respectively, with eleven fields of
// biography between them, and nothing tells you what is still missing until you
// press submit and get sent back up.
//
// So: the same page, reordered so the gates come first, with a bar pinned to
// the bottom that names what is outstanding by name and never lies.
//
// Prototype. Nothing here is saved.
export default function OnePage() {
  const [photos, setPhotos] = useState(0);
  const [city, setCity] = useState("");
  const [gender, setGender] = useState("");
  const [friend1, setFriend1] = useState("");
  const [friend2, setFriend2] = useState("");
  const [agree, setAgree] = useState(false);

  const missing = [
    photos === 0 ? "a photo" : null,
    !city ? "your city" : null,
    !gender ? "how you identify" : null,
    !friend1.includes("@") ? "your first friend's email" : null,
    !friend2.includes("@") ? "your second friend's email" : null,
    !agree ? "the terms box" : null,
  ].filter(Boolean) as string[];

  const ready = missing.length === 0;
  const sentence =
    missing.length === 0
      ? "Everything is here. We email your two friends the moment you submit."
      : missing.length === 1
        ? `Still needs ${missing[0]}.`
        : `Still needs ${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}.`;

  return (
    <main className="container-mc min-h-screen py-10 pb-32">
      <div className="flex items-center justify-between">
        <Logo />
        <Link href="/lab" className="text-xs text-muted underline underline-offset-2">
          Back to the lab
        </Link>
      </div>

      <div className="mt-10 max-w-xl">
        <p className="label mb-3">Application</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">
          Two friends get you in.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Not a form we read and judge. You name two friends of the opposite gender, we ask them,
          and when both answer you are a member. Everything else here takes a minute.
        </p>

        {/* The gates, first, because they are what the outcome depends on. */}
        <section className="mt-8 rounded-xl2 border border-claret/25 bg-claret/[0.04] p-5">
          <p className="label text-ink">The two things that decide it</p>

          <div className="mt-4">
            <p className="text-sm font-medium">1. A photo</p>
            <div className="mt-2 flex gap-2">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPhotos(Math.max(photos, i + 1))}
                  className={`grid h-20 w-16 place-items-center rounded-lg border text-xs transition ${
                    i < photos
                      ? "border-ink bg-ink text-cream"
                      : "border-dashed border-line bg-panel text-muted hover:border-ink"
                  }`}
                >
                  {i < photos ? "Added" : "Add"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium">2. Two friends who will vouch for you</p>
            <p className="mt-1 text-xs text-muted">
              {gender === "man"
                ? "Two women who know you well."
                : gender === "woman"
                  ? "Two men who know you well."
                  : "Two friends of the opposite gender. Pick how you identify below and this gets specific."}
            </p>
            <div className="mt-3 space-y-2">
              <input
                className="field"
                placeholder="First friend's email"
                value={friend1}
                onChange={(e) => setFriend1(e.target.value)}
              />
              <input
                className="field"
                placeholder="Second friend's email"
                value={friend2}
                onChange={(e) => setFriend2(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Everything else, visibly lighter. */}
        <section className="mt-8 space-y-5">
          <p className="label">The rest, quickly</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="c-first">First name</label>
              <input id="c-first" className="field mt-1.5" />
            </div>
            <div>
              <label className="label" htmlFor="c-dob">Date of birth</label>
              <input id="c-dob" type="date" className="field mt-1.5" />
            </div>
          </div>
          <ChoiceGroup
            name="city"
            label="City"
            required
            options={CITIES.map((c) => ({ value: c.value, label: c.label }))}
            value={city}
            onChange={setCity}
          />
          <ChoiceGroup
            name="gender"
            label="You are"
            required
            options={[
              { value: "woman", label: "Woman" },
              { value: "man", label: "Man" },
              { value: "nonbinary", label: "Non-binary" },
            ]}
            value={gender}
            onChange={setGender}
          />
          <Checkbox checked={agree} onChange={setAgree}>
            I am 18 or older and I agree to the Terms and Privacy Policy.
          </Checkbox>
        </section>
      </div>

      {/* The bar that never lies. It names what is left, by name, so nobody
          discovers a requirement by pressing submit and being sent back up. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-cream/95 backdrop-blur">
        <div className="container-mc flex flex-wrap items-center justify-between gap-3 py-4">
          <p className={`text-sm ${ready ? "text-ink" : "text-muted"}`}>{sentence}</p>
          <button
            type="button"
            disabled={!ready}
            className="btn-primary px-8 py-2.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit application
          </button>
        </div>
      </div>
    </main>
  );
}
