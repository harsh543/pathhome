# PathHome

PathHome is a voice-first reentry and housing coordination platform for nonprofits, counties, shelters, and reentry organizations.

Currently implemented through **Block 1**: Next.js App Router scaffold (strict TypeScript), a `pg` client with env-driven TLS, an idempotent PostgreSQL migration runner, the full data model, and a repeatable demo seed.

## Prerequisites

- Node.js 20+ and `pnpm` (`npm i -g pnpm`)
- Docker (for the local Aurora-compatible Postgres stand-in), **or** any reachable PostgreSQL via `DATABASE_URL`

## Setup

```bash
pnpm install
cp .env.example .env      # defaults point at the docker Postgres below
pnpm db:up                # start local Postgres 16 (docker compose, waits until healthy)
pnpm migrate              # apply db/migrations/*.sql (idempotent; re-runs are no-ops)
pnpm seed                 # 3 providers + 1 prompt_version + one demo case (idempotent)
pnpm typecheck            # strict tsc, no emit
```

`DATABASE_URL` points at the docker Postgres for local dev. In production it carries the Aurora
writer endpoint; TLS is controlled by `DATABASE_SSL` (`disable` | `require` | `verify-full`, the
last using `DATABASE_CA_CERT`). See `.env.example` for all config, including the privacy flags
`TRANSCRIPT_TTL_HOURS` and `OPT_OUT_MODEL_TRAINING`.

## Commands

```bash
pnpm dev          # next dev
pnpm build        # next build
pnpm typecheck    # tsc --noEmit (strict)
pnpm db:up        # start local Postgres (docker compose, --wait)
pnpm db:down      # stop it
pnpm db:reset     # wipe volume + recreate (fresh DB)
pnpm migrate      # run migrations
pnpm seed         # reset + seed demo data
```

## Data Model

Amazon Aurora PostgreSQL is the system of record. `db/migrations/0001_init.sql` defines 5 enums and
13 domain tables (providers, people, consent_records, cases, needs, referrals, follow_ups,
prompt_versions, call_sessions, transcripts, enrichment_results, call_metrics, audit_log). The
runner adds a `schema_migrations` bookkeeping table and tracks each file by checksum, so migrations
are immutable and re-runnable.

## Privacy & Trust Posture

PathHome is **assistive, not autonomous** — it never makes final housing, legal, benefits, or
referral decisions without human review. Transcripts are PII-redacted before persistence and stored
with a TTL; consent is a first-class record and no referral is created without one. These are
enforced in later blocks; the schema and config flags for them land here in Block 1.
