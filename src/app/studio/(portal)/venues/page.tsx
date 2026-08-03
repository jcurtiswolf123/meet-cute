import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { saveVenue, verifyVenue, retireVenue, discardVenue } from "@/lib/venue-actions";
import { VENUE_FRESH_DAYS } from "@/lib/date-ideas";
import { LabelledField } from "@/components/LabelledField";
import { ConfirmActionForm } from "@/components/forms";
import { Select } from "@/components/select";

export const dynamic = "force-dynamic";
export const metadata = { title: "Venues" };

// Where the connection email's suggestions come from.
//
// The list was CLI-only (`scripts/verify-venues.ts`), which meant the feature
// could only be switched on by someone with a terminal and the production
// database URL. It stayed off. A matchmaker needs to be able to add the place
// she took a client to last week, so this is the same operations with a page
// around them.
//
// Eligibility is deliberately narrow and shown on every row: active, plus
// verified inside VENUE_FRESH_DAYS. Everything else is visibly out, with the
// reason, so "why is nothing being suggested" is answerable at a glance rather
// than by reading date-ideas.ts.
type Row = Awaited<ReturnType<typeof loadVenues>>[number];

async function loadVenues() {
  return prisma.venue.findMany({
    orderBy: [{ city: "asc" }, { name: "asc" }],
    include: { _count: { select: { picks: true } } },
  });
}

/** Computed here rather than in the component body: reading the clock during
 *  render is impure, and the lint rule is right to say so. */
async function loadVenuesWithCutoff() {
  const venues = await loadVenues();
  return { venues, cutoff: new Date(Date.now() - VENUE_FRESH_DAYS * 24 * 3600 * 1000) };
}

function state(v: Row, cutoff: Date): { label: string; eligible: boolean; why: string } {
  // Inactive-and-never-verified is a proposal, not a retirement. Calling both
  // "Retired" read as "we used to send people here and stopped", which is the
  // opposite of what a fresh LLM suggestion is.
  if (!v.active && !v.lastVerifiedAt)
    return {
      label: "Proposed",
      eligible: false,
      why: "A suggestion nobody has checked yet. Confirm the place is open, add the address and booking link, then verify.",
    };
  if (!v.active) return { label: "Retired", eligible: false, why: "Not suggested. Verify to bring it back." };
  if (!v.lastVerifiedAt)
    return { label: "Never verified", eligible: false, why: "Nobody has confirmed this place is open, so it is never suggested." };
  if (v.lastVerifiedAt < cutoff)
    return { label: "Stale", eligible: false, why: `Last checked over ${VENUE_FRESH_DAYS} days ago. Confirm it is still open.` };
  return { label: "Eligible", eligible: true, why: "Can be suggested in a connection email." };
}

/** Proposals carry their provenance in notes. Worth showing, because "a model
 *  suggested this" is the single most useful thing to know before verifying. */
function isLlmProposal(v: Row): boolean {
  return !v.lastVerifiedAt && (v.notes ?? "").startsWith("Proposed by the LLM");
}

export default async function Venues() {
  await requireOperatorPage();
  const { venues, cutoff } = await loadVenuesWithCutoff();

  const rows = venues.map((v) => ({ v, s: state(v, cutoff) }));
  const byCity = (city: string) => rows.filter((r) => r.v.city === city);
  const eligibleIn = (city: string) => byCity(city).filter((r) => r.s.eligible).length;

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-sans tracking-[-0.012em] text-2xl font-medium">Venues</h1>
        <p className="mt-1 text-sm text-muted">
          Where the connection email suggests two people go. A place is only ever suggested after
          someone here confirms it is open, and that confirmation expires after {VENUE_FRESH_DAYS}{" "}
          days.
        </p>
      </div>

      <div className="ledger mb-6">
        {["NYC", "SF"].map((city) => (
          <div key={city} className={`ledger-cell ${eligibleIn(city) === 0 ? "bg-studio-canvas" : ""}`}>
            <div className="ledger-num">{eligibleIn(city)}</div>
            <div className="ledger-label">Eligible in {city}</div>
            {eligibleIn(city) === 0 && (
              <div className="text-[10px] text-muted">no ideas are sent for {city}</div>
            )}
          </div>
        ))}
      </div>

      {["NYC", "SF"].map((city) => (
        <section key={city} className="mt-8 first:mt-0">
          <p className="label !text-ink">{city}</p>
          {byCity(city).length === 0 ? (
            <p className="mt-3 rounded-xl2 border border-line bg-panel px-5 py-6 text-sm text-muted">
              Nothing on the list for {city} yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {byCity(city).map(({ v, s }) => (
                <li key={v.id} className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {v.name}
                        <span
                          className={`ml-2 rounded-full border px-2 py-0.5 text-[11px] font-normal ${
                            s.eligible
                              ? "border-ink/25 bg-studio-canvas text-ink"
                              : "border-line bg-studio-subtle text-muted"
                          }`}
                        >
                          {s.label}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {[v.area, v.cuisine, v.priceBand].filter(Boolean).join(" · ") || "no details yet"}
                      </p>
                      {v.address && <p className="mt-0.5 text-xs text-muted">{v.address}</p>}
                      <p className="mt-1.5 text-xs text-muted">{s.why}</p>
                      {isLlmProposal(v) && (
                        <p className="mt-1 text-xs text-muted">
                          Suggested by the co-pilot, which cannot check whether a place is still
                          open. Confirm it yourself before verifying.
                        </p>
                      )}
                      {v._count.picks > 0 && (
                        <p className="mt-1 text-xs text-ink">
                          {v._count.picks} pair{v._count.picks === 1 ? "" : "s"} said they were going here
                        </p>
                      )}
                      {!v.bookingUrl && !v.mapsUrl && (
                        <p className="mt-1 text-xs text-muted">
                          No booking or map link, so the email can only name it.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-none flex-wrap gap-2">
                      <form action={verifyVenue}>
                        <input type="hidden" name="venueId" value={v.id} />
                        <button className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-ink/85">
                          {s.eligible ? "Re-verify" : "Verify, it is open"}
                        </button>
                      </form>
                      {v.active && v.lastVerifiedAt && (
                        <ConfirmActionForm
                          action={retireVenue}
                          confirmMessage={`Stop suggesting ${v.name}?`}
                          triggerLabel="Retire"
                          confirmLabel="Retire"
                          pendingText="Retiring..."
                          buttonClassName="rounded-full border border-line px-3.5 py-1.5 text-xs transition hover:border-ink"
                        >
                          <input type="hidden" name="venueId" value={v.id} />
                        </ConfirmActionForm>
                      )}
                      {/* Only offered where nothing would be lost. Anything with
                          history is retired instead. */}
                      {!v.lastVerifiedAt && v._count.picks === 0 && (
                        <ConfirmActionForm
                          action={discardVenue}
                          confirmMessage={`Delete ${v.name} from the list?`}
                          triggerLabel="Discard"
                          confirmLabel="Discard"
                          pendingText="Discarding..."
                          buttonClassName="rounded-full border border-line px-3.5 py-1.5 text-xs text-muted transition hover:border-ink"
                        >
                          <input type="hidden" name="venueId" value={v.id} />
                        </ConfirmActionForm>
                      )}
                    </div>
                  </div>

                  <details className="mt-4">
                    <summary className="cursor-pointer list-none text-xs font-medium text-ink">
                      Edit details
                    </summary>
                    <VenueForm venue={v} />
                  </details>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="mt-10">
        <p className="label">Add a venue</p>
        <p className="mt-1 text-sm text-muted">
          It starts unverified, so nothing is suggested until you confirm it.
        </p>
        <div className="card mt-3 p-5">
          <VenueForm />
        </div>
      </section>
    </div>
  );
}

function VenueForm({ venue }: { venue?: Row }) {
  const key = venue?.id ?? "new";
  const field = (name: string, label: string, value: string, hint?: string, required?: boolean) => (
    <LabelledField id={`${name}-${key}`} label={label} hint={hint}>
      <input
        id={`${name}-${key}`}
        name={name}
        defaultValue={value}
        required={required}
        className="field mt-1"
      />
    </LabelledField>
  );

  return (
    <form action={saveVenue} className="mt-3 grid gap-3 sm:grid-cols-2">
      {venue && <input type="hidden" name="venueId" value={venue.id} />}
      {field("name", "Name", venue?.name ?? "", undefined, true)}
      <Select
          name="city"
          label="City"
          showLabel
          defaultValue={venue?.city ?? "NYC"}
          options={[
            { value: "NYC", label: "NYC" },
            { value: "SF", label: "SF" },
          ]}
        />
      {field("area", "Neighbourhood", venue?.area ?? "")}
      {field("cuisine", "Cuisine", venue?.cuisine ?? "")}
      <Select
          name="priceBand"
          label="Price"
          showLabel
          defaultValue={venue?.priceBand ?? ""}
          placeholder="Not set"
          options={[
            { value: "", label: "Not set" },
            { value: "$", label: "$" },
            { value: "$$", label: "$$" },
            { value: "$$$", label: "$$$" },
            { value: "$$$$", label: "$$$$" },
          ]}
        />
      {field("address", "Address", venue?.address ?? "")}
      {field(
        "bookingUrl",
        "Booking link",
        venue?.bookingUrl ?? "",
        "The venue's own reservation page. Mutuals books nothing.",
      )}
      {field("mapsUrl", "Map link", venue?.mapsUrl ?? "")}
      <div className="sm:col-span-2">
        {field(
          "goodFor",
          "Good for",
          venue?.goodFor ?? "",
          "Shown to members. Plain and true: walk-ins welcome, quiet enough to talk, closed Mondays.",
        )}
      </div>
      <div className="sm:col-span-2">
        {field(
          "notes",
          "Operator notes",
          venue?.notes ?? "",
          "Never shown to members. Where the verification came from is worth recording here.",
        )}
      </div>
      <div className="sm:col-span-2">
        <button className="btn-primary px-6 py-2.5">{venue ? "Save details" : "Add venue"}</button>
        {venue && (
          <span className="ml-3 text-xs text-muted">
            Saving details does not re-verify. Use Verify for that.
          </span>
        )}
      </div>
    </form>
  );
}
