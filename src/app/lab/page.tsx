import Link from "next/link";
import { Logo } from "@/components/ui";

export const metadata = { title: "UX lab", robots: { index: false, follow: false } };

// Local only. Three ways to ask for an application, side by side, so a choice
// can be made by using them rather than by describing them.
//
// The number that prompted this: on 3 August, 18 people completed an
// application and 18 signed in and never did. Seven of those had already
// uploaded photos, so they were deep in the form and still walked. The form is
// one long page that asks for a photo, eleven fields, two friends' contact
// details and a consent box before it does anything with any of it.
//
// Nothing here writes to the database. These are prototypes for a decision.
const OPTIONS = [
  {
    href: "/lab/a",
    name: "One thing at a time",
    thesis: "Six short screens instead of one long page.",
    detail:
      "Each screen asks one question, remembers the answer, and shows how far along you are. The friends step arrives last, when someone has already invested five screens of effort and is least likely to abandon.",
    best: "Highest completion on a phone. Every step is a decision you can make in three seconds.",
    cost: "Six navigations. Someone who wanted to fill it in during one coffee has to tap through.",
  },
  {
    href: "/lab/b",
    name: "Two halves, saved between",
    thesis: "The basics, then your friends, with a real save in the middle.",
    detail:
      "The first screen is you and takes a minute. Submitting it creates the application immediately, so leaving is no longer losing everything. The second screen is the two friends, and it can be finished later from a link.",
    best: "Recovers the people who leave: half an application is a person you can email, not a blank.",
    cost: "Two submits. The application exists in an incomplete state that the studio has to understand.",
  },
  {
    href: "/lab/c",
    name: "One page, honest about what is missing",
    thesis: "The current page, reordered, with a checklist that never lies.",
    detail:
      "Photo and friends move to the top because they are what actually gate acceptance. A bar pins to the bottom naming exactly what is still missing, by name, and the submit stays live rather than failing after the fact.",
    best: "Smallest change, no new routes or states. Nobody discovers a requirement after pressing submit.",
    cost: "Still a long page. It does not help the person who wanted to stop halfway.",
  },
];

export default function Lab() {
  return (
    <main className="container-mc min-h-screen py-12">
      <Logo />
      <div className="mt-10 max-w-2xl">
        <p className="label mb-3">Local prototypes</p>
        <h1 className="font-display text-4xl font-medium tracking-tight">
          Three ways to ask.
        </h1>
        <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-muted">
          On 3 August, 18 people finished an application and 18 signed in and never did. Seven of
          those had already uploaded photos, so they were most of the way through and still walked.
          Each of these is one theory about why. None of them writes anything: they are for
          deciding, not for shipping.
        </p>

        <ul className="mt-10 space-y-4">
          {OPTIONS.map((option, index) => (
            <li key={option.href}>
              <Link
                href={option.href}
                className="group block rounded-xl2 border border-line bg-panel p-6 transition duration-200 ease-soft hover:border-ink hover:bg-cream"
              >
                <div className="flex items-baseline gap-4">
                  <span className="font-display text-3xl leading-none text-claret tabular-nums">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <div className="flex-1">
                    <p className="font-display text-2xl leading-tight">{option.name}</p>
                    <p className="mt-1 text-sm text-muted">{option.thesis}</p>
                  </div>
                  <span className="text-sm text-muted transition group-hover:text-ink">Open</span>
                </div>
                <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-ink/85">
                  {option.detail}
                </p>
                <dl className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
                  <div>
                    <dt className="label">Best at</dt>
                    <dd className="mt-1 text-xs leading-relaxed text-muted">{option.best}</dd>
                  </div>
                  <div>
                    <dt className="label">Costs</dt>
                    <dd className="mt-1 text-xs leading-relaxed text-muted">{option.cost}</dd>
                  </div>
                </dl>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-xs text-muted">
          Live application for comparison:{" "}
          <Link href="/apply" className="text-claret underline">
            /apply
          </Link>
        </p>
      </div>
    </main>
  );
}
