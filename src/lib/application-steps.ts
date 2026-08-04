// The application, one question at a time.
//
// It used to be a single long page. Everything the applicant would ever be
// asked for was visible before anything had been asked: eleven fields, a photo,
// two friends' email addresses and a consent box. On 3 August, 18 people
// completed it and 18 signed in and never did, seven of them after uploading
// photos, which is the shape of a form that shows its whole cost up front.
//
// Two ideas from the lab, combined, because they are better together than
// either is alone:
//
//   one question per screen  nothing is a wall, every step is a decision
//                            somebody can make in three seconds
//   a real save at each one   leaving stops meaning losing everything, so a
//                            person who stops is a person you can write to
//
// Where somebody is lives on their row, not in a session or a cookie, so
// coming back on another device or from the email we send a day later lands
// them exactly where they stopped.
//
// It is a recorded field rather than something inferred from which columns are
// populated, and that distinction cost an hour: every applicant's name is
// filled in at sign-in from their email local part, and city defaults to NYC on
// the same row, so both look answered before anyone has answered anything.
// Inference sent returning applicants back to step one to redo work they had
// already done.

export type StepId = "name" | "city" | "gender" | "birthdate" | "photo" | "extras";

export type ApplicationRow = {
  name: string | null;
  city: string | null;
  gender: string | null;
  birthdate: Date | null;
  agreedTosAt: Date | null;
  basicsAt: Date | null;
  /** The furthest step answered. Null for anyone who applied before the
   *  application became a sequence of steps. */
  applicationStep: string | null;
};

export const STEPS: { id: StepId; title: (row: ApplicationRow) => string; sub: string }[] = [
  {
    id: "name",
    title: () => "What should we call you?",
    sub: "First name is plenty. Your surname stays private until you and a match have both said yes.",
  },
  {
    id: "city",
    title: () => "Where are you?",
    sub: "Introductions happen inside one city, and you can be in two of them.",
  },
  {
    id: "gender",
    title: () => "How do you identify?",
    sub: "Your matchmaker needs this, and so does the step where you name your friends.",
  },
  {
    id: "birthdate",
    title: () => "When were you born?",
    sub: "You have to be 18 or older to join. We show your age, never your date of birth.",
  },
  {
    id: "photo",
    title: () => "A photo of you",
    sub: "One is enough to start. Your matchmaker sees it, and so does the one person we introduce you to.",
  },
  {
    id: "extras",
    title: (row) => `Almost there, ${(row.name ?? "").split(" ")[0] || "friend"}.`,
    sub: "A couple of optional things, and the agreement. Then the part that actually gets you in.",
  },
];

/** Whether this step has been answered, read from the row itself. */
export function isStepDone(step: StepId, row: ApplicationRow, photoCount: number): boolean {
  switch (step) {
    case "name":
      return !!row.name?.trim();
    case "city":
      return !!row.city;
    case "gender":
      return !!row.gender;
    case "birthdate":
      return !!row.birthdate;
    case "photo":
      return photoCount > 0;
    case "extras":
      return !!row.agreedTosAt;
  }
}

/**
 * Where they belong: the step after the last one they answered.
 *
 * Read from `applicationStep` rather than inferred from which fields are
 * populated, because inference cannot work here. Every applicant's name is
 * filled in at sign-in from their email local part and city defaults to NYC on
 * the same row, so both fields look answered before anybody has answered
 * anything, and a returning applicant was sent back to step one to redo work
 * they had already done.
 *
 * Falls back to inference only for rows that predate the field, where the
 * remaining question is which of the later steps is unfinished.
 */
export function currentStep(row: ApplicationRow, photoCount: number): StepId {
  // Finished the basics already: the page sends them to their friends.
  if (row.basicsAt) return "extras";

  // Nothing recorded means nothing answered. It cannot mean "infer from the
  // fields", because a row with no answers at all still has a name (derived
  // from the email local part at sign-in) and a city (NYC, the default), so
  // inference starts a brand-new applicant three steps in, on a question they
  // were never asked, having skipped two they were.
  if (!isStepId(row.applicationStep)) return "name";

  // Something recorded: show the first thing genuinely missing, so a gap left
  // by a deleted photo or an older row is not stepped over, and otherwise the
  // step after the last one answered.
  for (const step of STEPS) {
    if (!isStepDone(step.id, row, photoCount)) return step.id;
  }
  return stepAfter(row.applicationStep) ?? "extras";
}

export function stepIndex(step: StepId): number {
  return Math.max(0, STEPS.findIndex((s) => s.id === step));
}

export function stepBefore(step: StepId): StepId | null {
  const index = stepIndex(step);
  return index > 0 ? STEPS[index - 1].id : null;
}

export function stepAfter(step: StepId): StepId | null {
  const index = stepIndex(step);
  return index < STEPS.length - 1 ? STEPS[index + 1].id : null;
}

export function isStepId(value: string | null | undefined): value is StepId {
  return STEPS.some((step) => step.id === value);
}
