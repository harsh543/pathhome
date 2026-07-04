import "dotenv/config";
import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

// Aurora PostgreSQL is the system of record. Connection + TLS are surfaced as config,
// never hardcoded (see master constraints). Locally we point DATABASE_URL at the
// docker-compose Postgres; in Aurora the same URL carries the writer endpoint.
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required (see .env.example)");
}

/**
 * TLS policy, env-driven:
 *   DATABASE_SSL=disable      -> no TLS (local docker Postgres)
 *   DATABASE_SSL=require      -> TLS, do not verify CA (quick Aurora dev)
 *   DATABASE_SSL=verify-full  -> TLS, verify CA (Aurora prod; provide DATABASE_CA_CERT)
 * Default: disable in development, verify-full in production.
 */
function resolveSsl(): PoolConfig["ssl"] {
  const mode =
    process.env.DATABASE_SSL ??
    (process.env.NODE_ENV === "production" ? "verify-full" : "disable");

  switch (mode) {
    case "disable":
      return undefined;
    case "require":
      return { rejectUnauthorized: false };
    case "verify-full":
      return {
        rejectUnauthorized: true,
        ca: process.env.DATABASE_CA_CERT || undefined,
      };
    default:
      throw new Error(
        `Invalid DATABASE_SSL="${mode}" (expected disable | require | verify-full)`,
      );
  }
}

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: resolveSsl(),
  max: Number(process.env.PGPOOL_MAX ?? 10),
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});

export async function query<T extends QueryResultRow>(
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, values as unknown[]);
}

/** Run a set of statements inside a single transaction, rolling back on any error. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
