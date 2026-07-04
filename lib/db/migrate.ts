import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { closePool, pool, withTransaction } from "./client";
import { serializeError } from "./errors";

// A real migration runner: each .sql file runs once, inside its own transaction,
// tracked in schema_migrations. Re-running `pnpm migrate` is a no-op — idempotent
// by construction so a fresh clone and a re-run both land in the same state.
const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");

interface AppliedRow {
  filename: string;
  checksum: string;
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);
}

async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    throw new Error(`No migration files found in ${MIGRATIONS_DIR}`);
  }

  const appliedResult = await pool.query<AppliedRow>(
    "select filename, checksum from schema_migrations",
  );
  const applied = new Map(appliedResult.rows.map((r) => [r.filename, r.checksum]));

  let appliedCount = 0;
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const prior = applied.get(file);

    if (prior !== undefined) {
      if (prior !== checksum) {
        throw new Error(
          `Migration ${file} was modified after being applied (checksum mismatch). ` +
            "Migrations are immutable — add a new migration instead.",
        );
      }
      console.log(JSON.stringify({ level: "info", event: "migration_skipped", file }));
      continue;
    }

    await withTransaction(async (client) => {
      await client.query(sql);
      await client.query(
        "insert into schema_migrations (filename, checksum) values ($1, $2)",
        [file, checksum],
      );
    });
    appliedCount += 1;
    console.log(JSON.stringify({ level: "info", event: "migration_applied", file }));
  }

  console.log(
    JSON.stringify({
      level: "info",
      event: "migrate_complete",
      total: files.length,
      applied: appliedCount,
    }),
  );
}

runMigrations()
  .catch((error: unknown) => {
    console.error(JSON.stringify({ level: "error", event: "migration_failed", error: serializeError(error) }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
