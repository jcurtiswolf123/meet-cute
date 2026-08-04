// Waiting on an outcome instead of on a screen.
//
// Every step of the application is a server action followed by a redirect, so
// the control a browser check wants to click appears strictly after the row has
// changed. Waiting only on the control makes a slow round trip indistinguishable
// from a missing control, and on a loaded CI runner that is not hypothetical:
// master went red three times on 4 August, in three different files, every one
// of them a wait on a UI transition that had not landed yet while the row
// underneath was already correct. One of those failures printed the page it was
// giving up on and it was rendering perfectly well.
//
// So: assert the commit, then give the screen room. A genuine regression still
// fails, and it fails saying which step never committed rather than which
// button never appeared.
import { prisma } from "../src/lib/prisma";

/** Long enough that a loaded runner is not a failure, short enough that a real
 *  regression does not hold the build for minutes. */
const PATIENCE_MS = 60_000;
const POLL_MS = 500;

type PersonRow = NonNullable<Awaited<ReturnType<typeof prisma.person.findUnique>>>;

/**
 * Poll a person row until it satisfies `done`.
 *
 * `description` is what gets printed when it does not, so write it as the thing
 * that was supposed to happen ("step two commits the city"), not as the query.
 */
export async function waitForRow(
  where: { id: string } | { email: string },
  done: (row: PersonRow) => boolean,
  description: string,
): Promise<PersonRow> {
  const deadline = Date.now() + PATIENCE_MS;
  for (;;) {
    const row = await prisma.person.findUnique({ where });
    if (row && done(row)) return row;
    if (Date.now() >= deadline) {
      throw new Error(
        `Waited ${PATIENCE_MS / 1000}s and ${description} never happened. ` +
          `Row: ${row ? JSON.stringify({ name: row.name, city: row.city, gender: row.gender, step: row.applicationStep, basicsAt: row.basicsAt }) : "does not exist"}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** The step the applicant has most recently answered, which is the signal that
 *  the screen after it is about to render. */
export const answered = (step: string) => (row: PersonRow) => row.applicationStep === step;
