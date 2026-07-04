# PathHome

Assistive reentry and housing coordination platform for nonprofits, counties,
shelters, and reentry organisations.  
**Assistive, not autonomous.** A human owns every housing, legal, and benefits
decision. The system does intake, summarisation, extraction, and routing.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (Next.js App Router — React Server Components + SSR)       │
│                                                                     │
│  /              Case list (priority-sorted, open-needs count)       │
│  /cases/[id]    Case detail — transcript · needs · referrals ·     │
│                 follow-ups · enrichment blockers · timeline         │
│  /analytics     Stat tiles + bar charts (status / priority)         │
│  /fleet-analysis Per-prompt-version completion · latency ·         │
│                 entity-capture · failure-mode clusters              │
│  /voice         Browser intake session (live mic → AssemblyAI, or  │
│                 scripted mock when no API key is configured)         │
└─────────────────────────────────────────────────────────────────────┘
           │ RSC data fetch            │ POST API calls
           ▼                           ▼
┌──────────────────────┐   ┌──────────────────────────────────────────┐
│  PostgreSQL (Aurora) │   │  Next.js Route Handlers                  │
│  system of record    │   │                                          │
│                      │   │  POST /api/voice/session                 │
│  13 domain tables:   │◄──│    mint AssemblyAI token (server-side)   │
│  people              │   │    create call_sessions row + audit      │
│  cases               │   │                                          │
│  needs               │   │  POST /api/tools/log-need                │
│  referrals           │   │  POST /api/tools/create-referral         │
│  follow_ups          │   │    consent-gated — fails closed (409)    │
│  consent_records     │   │  POST /api/tools/create-followup         │
│  call_sessions       │   │                                          │
│  transcripts         │   │  POST /api/enrich/[sessionId]            │
│  enrichment_results  │   │    starts enrichCall workflow            │
│  call_metrics        │   │                                          │
│  prompt_versions     │   │  POST /api/twilio/stream                 │
│  providers           │   │    TwiML bridge (TWILIO_ENABLED=false)   │
│  audit_log           │   │                                          │
└──────────────────────┘   └──────────────────────────────────────────┘
                                         │
                            ┌────────────▼──────────────────────────────┐
                            │  Vercel Workflow — enrichCall             │
                            │                                           │
                            │  Step 1  persistTranscript (idempotent)   │
                            │  Step 2  redactTranscript (PII regex)     │
                            │  Step 3  extractEnrichment                │
                            │            Claude temp=0                  │
                            │            Zod-validated output           │
                            │            defensive parse + fallback     │
                            │  Step 4  upsertEnrichment                 │
                            │  Step 5  saveCallMetrics                  │
                            │  Step 6  completeAndAudit                 │
                            └───────────────────────────────────────────┘
```

### Key invariants

| Constraint | Where enforced |
|---|---|
| Consent before referral | `createReferral()` — fails closed, blocked attempt audited outside rolled-back tx |
| PII redacted before persistence | `lib/voice/redact.ts` — applied in workflow step 2 and in live `VoiceClient` turns |
| Transcript TTL | `ttl_expires_at` set on insert; default 72 h via `TRANSCRIPT_TTL_HOURS` |
| API key stays server-side | `/api/voice/session` mints a short-lived AssemblyAI token; key never sent to browser |
| Temperature 0 in data path | All Anthropic calls: `temperature: 0` |
| LLM output always Zod-validated | `EnrichmentExtractionSchema.safeParse` + deterministic fallback; never hard-fails |
| Parameterised SQL only | Every query uses `$1…$N` placeholders — no string interpolation |
| Every write audited | `writeAudit()` in same transaction as domain write |

---

## Local development

### Prerequisites

- Node 22+ and pnpm 11
- Docker Desktop (local Postgres 16, Aurora stand-in)

### Setup

```bash
# 1. Clone and install
git clone https://github.com/harsh543/pathhome.git
cd pathhome
pnpm install

# 2. Copy env
cp .env.example .env
# Fill in ASSEMBLYAI_API_KEY and/or ANTHROPIC_API_KEY if available.
# Without keys the system runs in mock mode — all features demo correctly.

# 3. Start local Postgres
pnpm db:up

# 4. Run migrations (idempotent — safe to re-run)
pnpm migrate

# 5. Seed cinematic demo data
#    2 prompt versions · 3 cases · redacted transcripts · call metrics
pnpm seed

# 6. Start dev server
pnpm dev
# → http://localhost:3000
```

### Available scripts

| Command | Description |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` (strict) |
| `pnpm db:up` | Start local Postgres via Docker Compose |
| `pnpm db:down` | Stop local Postgres |
| `pnpm db:reset` | Wipe volume + restart |
| `pnpm migrate` | Run pending SQL migrations |
| `pnpm seed` | Reset domain tables + insert cinematic demo |
| `pnpm test` | DAL integration tests (real Postgres) |

### Environment variables

See `.env.example` for the full list.

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://pathhome:pathhome@localhost:5432/pathhome` | Aurora writer endpoint in prod |
| `DATABASE_SSL` | `disable` (dev) / `verify-full` (prod) | |
| `ASSEMBLYAI_API_KEY` | *(unset)* | Mock mode when absent |
| `ANTHROPIC_API_KEY` | *(unset)* | Enrichment LLM |
| `ENRICHMENT_MODEL` | `claude-haiku-4-5-20251001` | Override enrichment model |
| `TRANSCRIPT_TTL_HOURS` | `72` | Redacted transcript lifetime |
| `TWILIO_ENABLED` | `false` | Enable phone channel |

---

## Build blocks

| Block | Description |
|---|---|
| 1 | Scaffold, Aurora schema (13 tables), idempotent migrations, seed |
| 2 | Zod schemas, typed DAL, consent-gated referrals, integration tests |
| 3 | Operator dashboard — case list, case detail, analytics |
| 4 | AssemblyAI voice session endpoint + browser intake client (mock mode) |
| 5 | HTTP tool routes — log-need, create-referral, create-followup |
| 6 | Twilio Media Streams bridge (behind `TWILIO_ENABLED` flag) |
| 7 | Vercel Workflow `enrichCall` — 6 idempotent steps, Claude extraction |
| 8 | Fleet Analysis — per-prompt-version completion, latency, failure modes |
| 9 | `lib/obs/logger`, cinematic seed (2 prompt versions), README |
