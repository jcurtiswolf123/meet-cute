"use client";

import Link from "next/link";
import { useState } from "react";
import { Logo } from "@/components/ui";
import { ChoiceGroup, Checkbox } from "@/components/fields";
import { CITIES } from "@/lib/cities";

// B. Two halves, with a real save in the middle.
//
// The theory: the problem is not length, it is that leaving costs everything.
// Eighteen people signed in and never submitted on 3 August and we have nothing
// to show for any of them except, for seven, some photos. If the first half
// saved on its own, those eighteen would be eighteen half-applications with a
// name and a city, which is a person you can write to.
//
// So: the first screen is you, and submitting it creates the application. The
// second is the two friends, and it can be finished later from a link.
//
// Prototype. Nothing here is saved.
export default function TwoHalves() {
  const [half, setHalf] = useState<1 | 2>(1);
  const [city, setCity] = useState("");
  const [gender, setGender] = useState("");
  const [agree, setAgree] = useState(false);

  return (
    <main className="container-mc min-h-screen py-10">
      <div className="flex items-center justify-between">
        <Logo />
        <Link href="/lab" className="text-xs text-muted underline underline-offset-2">
          Back to the lab
        </Link>
      </div>

      <div className="mt-10 max-w-xl">
        {/* Two steps, both named up front, so the second is a known quantity
            rather than a surprise after the effort has been spent. */}
        <ol className="flex items-center gap-3 text-xs">
          {[
            { n: 1, label: "You" },
            { n: 2, label: "Your two friends" },
          ].map((s) => (
            <li key={s.n} className="flex items-center gap-2">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold ${
                  half >= (s.n as 1 | 2)
                    ? "border-ink bg-ink text-cream"
                    : "border-line bg-panel text-muted"
                }`}
              >
                {s.n}
              </span>
              <span className={half >= (s.n as 1 | 2) ? "text-ink" : "text-muted"}>{s.label}</span>
              {s.n === 1 && <span className="ml-1 h-px w-8 bg-line" />}
            </li>
          ))}
        </ol>

        {half === 1 ? (
          <div className="animate-fadeup">
            <h1 className="mt-8 font-display text-4xl font-medium tracking-tight">
              Start with you.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              A minute, and we save it. You can close this and come back to the second half from a
              link we send you, and nothing you have typed is lost.
            </p>

            <div className="mt-8 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="b-first">First name</label>
                  <input id="b-first" className="field mt-1.5" placeholder="Your first name" />
                </div>
                <div>
                  <label className="label" htmlFor="b-last">Last name</label>
                  <input id="b-last" className="field mt-1.5" placeholder="Optional" />
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
              <div>
                <label className="label" htmlFor="b-dob">Date of birth</label>
                <input id="b-dob" type="date" className="field mt-1.5" />
              </div>
              <div className="grid h-40 place-items-center rounded-xl2 border border-dashed border-line bg-panel text-sm text-muted">
                Photos go here
              </div>
              <Checkbox checked={agree} onChange={setAgree}>
                I am 18 or older and I agree to the Terms and Privacy Policy.
              </Checkbox>
            </div>

            <button
              type="button"
              onClick={() => setHalf(2)}
              className="btn-primary mt-8 w-full py-3"
            >
              Save and continue
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              Saved as soon as you press this. The next part is two names and two email addresses.
            </p>
          </div>
        ) : (
          <div className="animate-fadeup">
            <p className="label mt-8 mb-3">Saved</p>
            <h1 className="font-display text-4xl font-medium tracking-tight">
              Now the part that gets you in.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Two friends of the opposite gender. We email them, they write a few sentences or vouch
              with one tap, and the moment both answer you are a member. They never hear from us
              again after that.
            </p>

            <div className="mt-8 space-y-6">
              {[1, 2].map((n) => (
                <div key={n} className="rounded-xl2 border border-line bg-panel p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Friend {n}
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input className="field" placeholder="Their name" />
                    <input className="field" placeholder="them@email.com" />
                  </div>
                </div>
              ))}
              <div>
                <label className="label" htmlFor="b-note">
                  Anything you want us to say to them? <span className="text-muted">(optional)</span>
                </label>
                <input
                  id="b-note"
                  className="field mt-1.5"
                  placeholder="One line, in your words, at the top of their email."
                />
              </div>
            </div>

            <button type="button" className="btn-primary mt-8 w-full py-3">
              Send the asks
            </button>
            <button
              type="button"
              onClick={() => setHalf(1)}
              className="mt-3 w-full text-center text-xs text-muted underline underline-offset-2"
            >
              Back to the first half
            </button>
            <p className="mt-4 text-center text-xs text-muted">
              Not ready? Close this. We will email you the link to finish.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
