import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Query tracing, off unless asked for. The studio's cost is round trips, not
// rows: the app runs in one AWS region and Neon runs in another, so a page that
// issues twenty statements waits about a second before it renders a thing.
// Counting statements is the only measurement that transfers from a laptop
// (sub-millisecond database) to production, so make it possible to count them.
const traceQueries = process.env.PRISMA_LOG_QUERIES === "1";

// How many connections the client may hold open. Prisma's default is
// `cpus * 2 + 1`, and a Fly shared-cpu-1x machine reports one CPU, so the
// default was three. The studio directory issues nine queries at once
// specifically so it waits 50ms rather than 450; with three lanes, six of them
// queued anyway and the Promise.all was mostly decorative. Neon's pooled
// endpoint is pgbouncer and is sized for far more than this.
//
// Set on the URL rather than in Fly's secrets so it travels with the code and
// applies to the sandbox, the tests, and both machines identically. An explicit
// `connection_limit` in DATABASE_URL still wins.
const CONNECTION_LIMIT = 12;
const POOL_TIMEOUT_SECONDS = 20;

function tunedDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", String(CONNECTION_LIMIT));
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", String(POOL_TIMEOUT_SECONDS));
    }
    return url.toString();
  } catch {
    // An unparseable URL is Prisma's problem to report, not ours to mangle.
    return raw;
  }
}

export const prisma = globalForPrisma.prisma ?? createClient();

function createClient(): PrismaClient {
  const url = tunedDatabaseUrl();
  const client = new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: traceQueries
      ? [{ emit: "event", level: "query" }, "error"]
      : process.env.NODE_ENV === "development"
        ? ["error"]
        : [],
  });
  if (traceQueries) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).$on("query", (e: Prisma.QueryEvent) => {
      console.log(`prisma-query ${e.duration}ms ${e.query.slice(0, 200).replace(/\s+/g, " ")}`);
    });
  }
  return client;
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
