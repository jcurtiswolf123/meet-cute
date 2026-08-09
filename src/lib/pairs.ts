// Pure pair helpers. No database import: the introduction composer is a client
// component and imports `pairKey`, so anything Prisma-shaped in this file would
// be pulled into the browser bundle. The query that fills these in lives in
// `introductions.ts` as `pairStates`.

/** What already exists between two people, as far as a new introduction cares. */
export type PairState = "open" | "connected" | "blocked";

/** Order-independent key for a pair, so a lookup never depends on who is A. */
export function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}
