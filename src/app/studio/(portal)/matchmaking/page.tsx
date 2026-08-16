import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { quickAddPerson } from "@/lib/actions";
import { IntroComposer } from "./IntroComposer";
import { introNotice } from "./intro-notice";
import { pairStates } from "@/lib/introductions";
import { Select } from "@/components/select";
import { Checkbox } from "@/components/fields";
import { CITIES } from "@/lib/cities";

export const dynamic = "force-dynamic";

// Making a match, and nothing else.
//
// Until 2026-08-16 this page also drew every live introduction with its own set
// of actions, and the whole roster as a table. Both already had a rail item of
// their own (Conversations and Directory), so the same rows were rendered three
// and two times respectively, with different affordances on each, and an
// operator had to know which copy carried the button they wanted. The live
// introductions and their actions are one surface now at
// `/studio/matches?view=live`; the roster is the Directory.
//
// The introduction counts stay, as counts. They are the reason to come here.

export default async function Matchmaking({
  searchParams,
}: {
  searchParams?: Promise<{ intro?: string; with?: string }>;
}) {
  await requireOperatorPage();
  const sp = await searchParams;

  // One lane. Counts rather than rows for the ledger: the page used to pull
  // every live introduction whole, with both people and every feedback note, to
  // render three numbers and a list that now lives somewhere else.
  const [people, pairs, awaiting, connected] = await Promise.all([
    prisma.person.findMany({
      where: { isOperator: false, isAmbassador: false, isCoach: false, status: "active" },
      relationLoadStrategy: "join",
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        openToMatch: true,
        lookingFor: true,
        smsConsentAt: true,
        photos: {
          where: { status: { not: "rejected" } },
          orderBy: { order: "asc" },
          take: 1,
          select: { url: true },
        },
      },
      orderBy: [{ openToMatch: "desc" }, { name: "asc" }],
    }),
    pairStates(),
    prisma.match.count({ where: { stage: { in: ["invited", "mutual_yes"] } } }),
    prisma.match.count({ where: { stage: "connected" } }),
  ]);

  const ready = people.filter((p) => p.openToMatch).length;
  const noPhone = people.filter((p) => !p.phone).length;

  // Composer leads with people who've opted in (those are the ones to match).
  // Only identity and reachability travel here: the invitation itself is built
  // from each person's own profile at send time, so nothing is copied through.
  const composerPeople = people
    .filter((p) => p.openToMatch)
    .map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      canText: !!p.smsConsentAt,
      city: p.city,
      photoUrl: p.photos[0]?.url ?? null,
      lookingFor: p.lookingFor,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-sans tracking-[-0.012em] text-2xl font-medium">Matchmaking</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Pick two people and send the introduction. Everything already in flight lives on{" "}
          <Link href="/studio/matches" className="text-ink underline underline-offset-2">
            Matches
          </Link>
          .
        </p>
      </div>

      {/* KPI ledger: one editorial strip, lead metric tinted claret. Each number
          links to where it can be acted on, since none of them are actionable
          here. */}
      <div className="ledger">
        {[
          { label: "Ready to match", value: ready, lead: true, href: "/studio" },
          { label: "Awaiting replies", value: awaiting, href: "/studio/matches" },
          { label: "Connected", value: connected, href: "/studio/matches?view=all" },
          { label: "People", value: people.length, href: "/studio" },
          { label: "Missing a phone", value: noPhone, href: "/studio" },
        ].map((k) => (
          <Link
            key={k.label}
            href={k.href}
            className={`ledger-cell transition hover:bg-studio-canvas${k.lead ? " ledger-cell-lead" : ""}`}
          >
            <div className="ledger-num">{k.value}</div>
            <div className="ledger-label">{k.label}</div>
          </Link>
        ))}
      </div>

      <IntroComposer
        people={composerPeople}
        pairs={pairs}
        defaultBId={sp?.with}
        returnTo="/studio/matchmaking"
        notice={introNotice(sp?.intro)}
      />

      {/* Quick-add a person. Stays open once expanded: a server-action submit
          re-renders and a `<details>` with no `open` would re-collapse, charging
          the expand click again on every add. */}
      <details open className="card p-5">
        <summary className="cursor-pointer font-sans tracking-[-0.012em] text-lg font-medium">
          Add someone to match
        </summary>
        <p className="mt-1 text-sm text-muted">
          Add someone only after they ask to be matched. Email is the baseline channel. Texting is
          optional and needs separate consent.
        </p>
        <form action={quickAddPerson} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Name</span>
            <input name="name" required placeholder="Jordan Rivera" className="field mt-1.5" />
          </label>
          <label className="block">
            <span className="label">Mobile number (optional)</span>
            <input name="phone" type="tel" placeholder="(555) 123-4567" className="field mt-1.5" />
          </label>
          <Select
            name="city"
            label="City"
            showLabel
            defaultValue="NYC"
            options={CITIES.map((c) => ({ value: c.value, label: c.short }))}
          />
          <label className="block">
            <span className="label">Email (optional)</span>
            <input name="email" type="email" placeholder="optional" className="field mt-1.5" />
          </label>
          <label className="block">
            <span className="label">Instagram (optional)</span>
            <input name="instagram" placeholder="@handle or link" className="field mt-1.5" />
          </label>
          <label className="block">
            <span className="label">LinkedIn (optional)</span>
            <input name="linkedin" placeholder="handle or link" className="field mt-1.5" />
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Notes about them (optional)</span>
            <input
              name="blurb"
              placeholder="Founder, loves trail running, wants something serious."
              className="field mt-1.5"
            />
          </label>
          <Checkbox name="matchingConsent" required className="sm:col-span-2">
            I confirm this person asked to be added to Mutuals and is ready to receive matchmaking
            introductions.
          </Checkbox>
          <Checkbox name="smsConsent" className="sm:col-span-2">
            I confirm this person separately agreed to receive Mutuals text messages at the mobile
            number above. Message and data rates may apply. Reply STOP to cancel.
          </Checkbox>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">
              Add person
            </button>
          </div>
        </form>
      </details>
    </div>
  );
}
