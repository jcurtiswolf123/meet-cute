"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/ui";
import { ChoiceGroup, Checkbox } from "@/components/fields";
import { CITIES } from "@/lib/cities";

// A. One thing at a time.
//
// The theory: the current page fails because it shows the whole cost up front.
// Eleven fields, a photo, two friends' email addresses and a consent box are
// visible before anything has been asked, and the seven people who uploaded
// photos and left had already paid most of that cost.
//
// So: one question per screen, answers kept as you go, and the friends step
// last, when someone has already put five screens of effort in and is least
// likely to walk away from it.
//
// Prototype. Nothing here is saved.
type Answers = {
  first: string;
  city: string;
  secondCity: string;
  gender: string;
  birthdate: string;
  lookingFor: string;
  friendName: string;
  friendEmail: string;
  agree: boolean;
};

const EMPTY: Answers = {
  first: "",
  city: "",
  secondCity: "",
  gender: "",
  birthdate: "",
  lookingFor: "",
  friendName: "",
  friendEmail: "",
  agree: false,
};

export default function StepFlow() {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>(EMPTY);
  const set = (patch: Partial<Answers>) => setA((prev) => ({ ...prev, ...patch }));

  const steps = [
    {
      title: "What should we call you?",
      sub: "First name is plenty.",
      done: a.first.trim().length > 0,
      body: (
        <input
          autoFocus
          className="field mt-2 text-lg"
          value={a.first}
          onChange={(e) => set({ first: e.target.value })}
          placeholder="Your first name"
        />
      ),
    },
    {
      title: "Where are you?",
      sub: "Introductions happen inside one city, and you can be in two.",
      done: !!a.city,
      body: (
        <div className="mt-2 space-y-5">
          <ChoiceGroup
            name="city"
            label="City"
            required
            options={CITIES.map((c) => ({ value: c.value, label: c.label }))}
            value={a.city}
            onChange={(v) => set({ city: v, secondCity: v === a.secondCity ? "" : a.secondCity })}
          />
          {a.city && (
            <ChoiceGroup
              name="secondCity"
              label="Also there often"
              options={[
                { value: "", label: "Just one city" },
                ...CITIES.filter((c) => c.value !== a.city).map((c) => ({
                  value: c.value,
                  label: c.label,
                })),
              ]}
              value={a.secondCity}
              onChange={(v) => set({ secondCity: v })}
            />
          )}
        </div>
      ),
    },
    {
      title: "You are",
      sub: "Your matchmaker needs this, and so does the friends step.",
      done: !!a.gender,
      body: (
        <ChoiceGroup
          className="mt-2"
          name="gender"
          label="You are"
          required
          options={[
            { value: "woman", label: "Woman" },
            { value: "man", label: "Man" },
            { value: "nonbinary", label: "Non-binary" },
          ]}
          value={a.gender}
          onChange={(v) => set({ gender: v })}
        />
      ),
    },
    {
      title: "When were you born?",
      sub: "You have to be 18 or older to join.",
      done: a.birthdate.length === 10,
      body: (
        <input
          type="date"
          className="field mt-2 text-lg"
          value={a.birthdate}
          onChange={(e) => set({ birthdate: e.target.value })}
        />
      ),
    },
    {
      title: "A photo of you",
      sub: "One is enough to start. The person we introduce you to sees it.",
      done: true,
      body: (
        <div className="mt-2 grid h-56 place-items-center rounded-xl2 border border-dashed border-line bg-panel text-sm text-muted">
          The real uploader goes here
        </div>
      ),
    },
    {
      title: `Who vouches for you, ${a.first || "you"}?`,
      sub:
        a.gender === "man"
          ? "Two women who know you well. We ask them, not you."
          : a.gender === "woman"
            ? "Two men who know you well. We ask them, not you."
            : "Two friends who know you well. We ask them, not you.",
      done: a.friendName.trim().length > 0 && a.friendEmail.includes("@") && a.agree,
      body: (
        <div className="mt-2 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="field"
              placeholder="Their name"
              value={a.friendName}
              onChange={(e) => set({ friendName: e.target.value })}
            />
            <input
              className="field"
              placeholder="them@email.com"
              value={a.friendEmail}
              onChange={(e) => set({ friendEmail: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted">
            The second friend goes here too. They get one email, they can vouch with one tap, and
            nothing is asked of them again.
          </p>
          <Checkbox checked={a.agree} onChange={(v) => set({ agree: v })}>
            I am 18 or older and I agree to the Terms and Privacy Policy.
          </Checkbox>
        </div>
      ),
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <main className="container-mc flex min-h-screen flex-col py-10">
      <div className="flex items-center justify-between">
        <Logo />
        <Link href="/lab" className="text-xs text-muted underline underline-offset-2">
          Back to the lab
        </Link>
      </div>

      {/* Progress that reads as progress, not as a wall of remaining work. */}
      <div className="mt-10 flex gap-1.5" aria-hidden>
        {steps.map((_, i) => (
          <span
            key={i}
            className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${
              i <= step ? "bg-ink" : "bg-line"
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Step {step + 1} of {steps.length}
      </p>

      <div className="mt-12 flex-1">
        <div key={step} className="animate-fadeup max-w-xl">
          <h1 className="font-display text-4xl font-medium leading-tight tracking-tight">
            {current.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{current.sub}</p>
          {current.body}
        </div>
      </div>

      <div className="sticky bottom-0 mt-10 flex items-center gap-3 border-t border-line bg-cream/95 py-5 backdrop-blur">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="btn-ghost px-6">
            Back
          </button>
        )}
        <button
          type="button"
          disabled={!current.done}
          onClick={() => (last ? null : setStep(step + 1))}
          className="btn-primary flex-1 py-3 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {last ? "Submit application" : "Continue"}
        </button>
      </div>
    </main>
  );
}
