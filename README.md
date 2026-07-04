# PathHome

PathHome is a voice-first reentry and housing coordination platform for nonprofits, counties, shelters, and reentry organizations.

Currently implemented through **Phase 2**: Next.js App Router scaffold (strict TypeScript), a `pg` client with env-driven TLS, an idempotent PostgreSQL migration runner, the full data model, repeatable demo seed data, Zod schemas, typed query functions, audit-backed writes, and consent-gated referral creation.

## Prerequisites

- Node.js 20+
- Docker (for the local Aurora-compatible Postgres stand-in), **or** any reachable PostgreSQL via `DATABASE_URL`

## Setup

```bash
npm install
cp .env.example .env      # defaults point at the docker Postgres below
npm run db:up             # start local Postgres 16 (docker compose, waits until healthy)
npm run migrate           # apply db/migrations/*.sql (idempotent; re-runs are no-ops)
npm run seed              # 3 providers + 1 prompt_version + one demo case (idempotent)
npm run typecheck         # strict tsc, no emit
npm run test              # consent-gated referral tests
```

`DATABASE_URL` points at the docker Postgres for local dev. In production it carries the Aurora
writer endpoint; TLS is controlled by `DATABASE_SSL` (`disable` | `require` | `verify-full`, the
last using `DATABASE_CA_CERT`). See `.env.example` for all config, including the privacy flags
`TRANSCRIPT_TTL_HOURS` and `OPT_OUT_MODEL_TRAINING`.

## Commands

```bash
npm run dev          # next dev
npm run build        # next build
npm run typecheck    # tsc --noEmit (strict)
npm run test         # node:test via tsx
npm run db:up        # start local Postgres (docker compose, --wait)
npm run db:down      # stop it
npm run db:reset     # wipe volume + recreate (fresh DB)
npm run migrate      # run migrations
npm run seed         # reset + seed demo data
```

## Data Model

Amazon Aurora PostgreSQL is the system of record. `db/migrations/0001_init.sql` defines 5 enums and
13 domain tables (providers, people, consent_records, cases, needs, referrals, follow_ups,
prompt_versions, call_sessions, transcripts, enrichment_results, call_metrics, audit_log). The
runner adds a `schema_migrations` bookkeeping table and tracks each file by checksum, so migrations
are immutable and re-runnable.

## Typed Data Access

`lib/schemas/db.ts`, `lib/schemas/tools.ts`, and `lib/schemas/enrichment.ts` define the Zod contracts for database rows, tool payloads, and extraction output. `lib/db/queries.ts` validates every write payload and returned row, uses parameterized SQL, writes audit records for state changes, and fails closed when `createReferral` is called without a matching granted `referral` consent record.

## Privacy & Trust Posture

PathHome is **assistive, not autonomous** — it never makes final housing, legal, benefits, or
referral decisions without human review. Transcripts are PII-redacted before persistence and stored
with a TTL; consent is a first-class record and no referral is created without one.
