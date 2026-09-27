// A check that writes fixture rows must never run against the live roster.
//
// The repo's `.env` points `DATABASE_URL` at the production Neon branch on
// purpose, and every `test:launch:*` script loads it with
// `--env-file-if-exists=.env`. So a check that creates people, sessions or
// delivery jobs and does not assert its own database will quietly create them
// in production. Thirteen scripts carried this guard inline; seven did not, and
// nothing made the gap visible.
//
// Call this before the first Prisma import in a dynamically-imported check, or
// at module scope in a statically-imported one. Importing `src/lib/prisma`
// opens no connection, so module scope is early enough.
//
// `scripts/test-launch-pure.ts` asserts that every check touching Prisma calls
// this, so a new script cannot ship without it.

const LOCAL_HOSTS = ["127.0.0.1", "localhost"];

export function requireLocalDatabase(label: string): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(`${label} require an isolated local database; DATABASE_URL is not set.`);
  }
  let hostname: string;
  try {
    hostname = new URL(databaseUrl).hostname;
  } catch {
    throw new Error(`${label} require an isolated local database; DATABASE_URL is not a URL.`);
  }
  if (!LOCAL_HOSTS.includes(hostname)) {
    throw new Error(
      `${label} require an isolated local database. DATABASE_URL points at ${hostname}. ` +
        "Run `set -a; . ./.env.sandbox; set +a` first.",
    );
  }
  return databaseUrl;
}
