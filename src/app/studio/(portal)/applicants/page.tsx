import { prisma } from "@/lib/prisma";
import { requireOperatorPage } from "@/lib/page-auth";
import { citiesOf, cityShort } from "@/lib/cities";
import { REQUIRED_RECOMMENDATIONS } from "@/lib/recommendations";
import { ApplicantGallery, type GalleryPerson } from "./ApplicantGallery";

export const dynamic = "force-dynamic";

// What every card and every full-size view needs, and nothing else. Faces are
// the point of this page, so the photos come whole rather than the single
// avatar the directory takes.
const CARD = {
  id: true,
  name: true,
  age: true,
  city: true,
  secondCity: true,
  neighborhood: true,
  email: true,
  headline: true,
  lookingFor: true,
  appliedAt: true,
  basicsAt: true,
  createdAt: true,
  photos: {
    where: { status: { not: "rejected" } },
    orderBy: { order: "asc" },
    select: { id: true, url: true },
  },
} as const;

const NOT_STAFF = { isOperator: false, isAmbassador: false, isCoach: false } as const;

function ago(when: Date | null): string {
  if (!when) return "";
  const days = Math.floor((Date.now() - when.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default async function Applicants() {
  await requireOperatorPage();

  // Three lists, one lane. Each is small (the roster is around thirty people),
  // and issuing them together costs one round trip to us-east-2 rather than
  // three stacked end to end.
  const [toReview, unfinished, members] = await Promise.all([
    prisma.person.findMany({
      where: { ...NOT_STAFF, status: "applicant", appliedAt: { not: null } },
      relationLoadStrategy: "join",
      select: {
        ...CARD,
        recommendationsReceived: {
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, status: true, body: true, relationship: true },
        },
      },
      orderBy: { appliedAt: "desc" },
    }),
    // Saved their details and their photo, never named a friend. They are not a
    // decision yet, but they have a face and they are one screen from being a
    // member, so they belong on the same wall.
    prisma.person.findMany({
      where: { ...NOT_STAFF, status: "applicant", basicsAt: { not: null }, appliedAt: null },
      relationLoadStrategy: "join",
      select: { ...CARD, unfinishedNudgedAt: true },
      orderBy: { basicsAt: "desc" },
    }),
    prisma.person.findMany({
      where: { ...NOT_STAFF, status: "active" },
      relationLoadStrategy: "join",
      select: CARD,
      orderBy: { name: "asc" },
    }),
  ]);

  const shared = (p: {
    id: string;
    name: string;
    age: number | null;
    city: string;
    secondCity: string | null;
    neighborhood: string | null;
    email: string | null;
    headline: string | null;
    lookingFor: string | null;
    photos: { id: string; url: string }[];
  }) => ({
    id: p.id,
    name: p.name,
    age: p.age,
    cities: citiesOf(p).map(cityShort).join(" + "),
    neighborhood: p.neighborhood,
    email: p.email,
    headline: p.headline,
    lookingFor: p.lookingFor,
    photos: p.photos,
  });

  const review: GalleryPerson[] = toReview.map((p) => {
    const written = p.recommendationsReceived.filter((r) => r.status === "submitted");
    const waiting = p.recommendationsReceived
      .filter((r) => r.status !== "submitted")
      .map((r) => r.name.split(" ")[0]);
    return {
      ...shared(p),
      when: `Applied ${ago(p.appliedAt)}`,
      decidable: true,
      outstanding: waiting.length,
      gate:
        p.recommendationsReceived.length === 0
          ? "No friends named yet"
          : `${written.length} of ${REQUIRED_RECOMMENDATIONS} friends have written${
              waiting.length ? `, waiting on ${waiting.join(" and ")}` : ""
            }`,
      recommendations: written.map((r) => ({
        id: r.id,
        name: r.name,
        body: r.body,
        relationship: r.relationship,
      })),
    };
  });

  const stalled: GalleryPerson[] = unfinished.map((p) => ({
    ...shared(p),
    when: `Started ${ago(p.basicsAt)}${p.unfinishedNudgedAt ? ", chased" : ", not chased yet"}`,
    decidable: false,
    outstanding: 0,
    gate: "Stopped before naming friends",
    recommendations: [],
  }));

  const roster: GalleryPerson[] = members.map((p) => ({
    ...shared(p),
    when: "",
    decidable: false,
    outstanding: 0,
    gate: "",
    recommendations: [],
  }));

  return (
    <div>
      <h1 className="font-sans tracking-[-0.012em] text-2xl font-medium">Applicants</h1>
      <p className="mt-1 text-sm text-muted">
        Every face, full size. Open one to page through their photos with the arrow keys, and decide
        without leaving the wall.
      </p>
      <ApplicantGallery review={review} stalled={stalled} roster={roster} />
    </div>
  );
}
