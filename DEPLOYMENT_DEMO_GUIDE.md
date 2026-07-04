# PathHome Cloud Setup and Demo Runbook

This guide is written for a smooth technical demo of PathHome from
`https://github.com/harsh543/pathhome`.

## Current Demo Scope

The repository currently supports:

- Next.js App Router dashboard on Vercel.
- Aurora PostgreSQL-compatible schema, migrations, and seed data.
- Operator case list, case detail, analytics, and fleet-analysis placeholder.
- Browser voice page with safe mock mode when `ASSEMBLYAI_API_KEY` is not set.
- Tool API routes for logging needs, creating follow-ups, and consent-gated referrals.
- Zod validation, parameterized SQL, and audit logging on state changes.

For the safest live demo, use mock voice mode first. Live AssemblyAI/Twilio should be treated as
post-demo hardening until the `TODO(verify-docs)` comments in the voice adapter are resolved.

## Reference Architecture

```text
Browser / Operator
      |
      v
Vercel Next.js App Router
  - Dashboard server components
  - Tool API routes
  - Browser voice session API
      |
      +--> Amazon Aurora PostgreSQL
      |      - cases, needs, referrals, transcripts, enrichment, metrics
      |
      +--> AssemblyAI Realtime / Voice Agent path
             - mock mode for demo when key is absent
             - live mode after adapter verification

Future phone edge:
Twilio Media Streams --> Vercel route / bridge service --> AssemblyAI
```

## Local Demo Setup

```bash
git clone https://github.com/harsh543/pathhome.git
cd pathhome
npm install
cp .env.example .env
npm run db:up
npm run migrate
npm run seed
npm run typecheck
npm run test
npm run build
npm run dev
```

Open:

- `http://localhost:3000/`
- `http://localhost:3000/voice`
- `http://localhost:3000/analytics`
- `http://localhost:3000/fleet-analysis`

Keep `ASSEMBLYAI_API_KEY` empty for mock voice mode. That gives you a reliable browser demo without
external voice credentials.

## Vercel Deployment

1. In Vercel, import `harsh543/pathhome` from GitHub.
2. Framework preset: `Next.js`.
3. Install command: `npm install`.
4. Build command: `npm run build`.
5. Output directory: leave default.
6. Node version: Node 20 or newer.

Set these Vercel environment variables for Production and Preview:

```bash
DATABASE_URL=postgres://USER:PASSWORD@AURORA_WRITER_ENDPOINT:5432/pathhome
DATABASE_SSL=require
DATABASE_CA_CERT=
PGPOOL_MAX=2
ASSEMBLYAI_API_KEY=
TRANSCRIPT_TTL_HOURS=72
OPT_OUT_MODEL_TRAINING=true
TWILIO_ENABLED=false
```

Notes:

- `DATABASE_URL` must exist at build time because the app imports DB-backed server modules.
- Use `DATABASE_SSL=require` for a fast demo. For production, use `DATABASE_SSL=verify-full` and
  provide the AWS RDS CA bundle through `DATABASE_CA_CERT`.
- Keep `PGPOOL_MAX` low on Vercel unless you add RDS Proxy or another pooler.

## Aurora PostgreSQL Setup

Recommended demo path:

1. Create an Aurora PostgreSQL-compatible cluster or Aurora Serverless v2 cluster.
2. Database name: `pathhome`.
3. App user: `pathhome_app`.
4. Enable encryption at rest, automated backups, and Performance Insights.
5. For a short demo, allow Vercel connectivity to the writer endpoint.
6. For production, place RDS Proxy in front of Aurora and use tighter network/IAM controls.

After the database exists, run migrations and seed data from your laptop:

```bash
DATABASE_URL='postgres://USER:PASSWORD@AURORA_WRITER_ENDPOINT:5432/pathhome' \
DATABASE_SSL=require \
npm run migrate

DATABASE_URL='postgres://USER:PASSWORD@AURORA_WRITER_ENDPOINT:5432/pathhome' \
DATABASE_SSL=require \
npm run seed
```

Use `npm run seed` only for demo environments. Do not run demo seed data in a real production tenant.

## Pre-Demo Checklist

Run this one hour before your demo:

```bash
git pull
npm install
npm run typecheck
npm run test
npm run build
npm run migrate
npm run seed
npm run dev
```

Then click through:

- `/` shows one seeded case.
- Case detail shows needs, follow-ups, referral, redacted transcript, summary, and blockers.
- `/voice` starts mock call and shows live turn-by-turn transcript.
- `/analytics` shows total cases, active cases, open needs, and escalated count.

## Demo Flow

Target time: 5 to 7 minutes.

1. Open with the problem.
2. Show the operator dashboard.
3. Open the seeded case detail.
4. Show the redacted transcript and extracted needs.
5. Start the browser voice mock call.
6. Explain consent-gated referrals and human-in-the-loop posture.
7. Show analytics/fleet-analysis direction.
8. Close with cloud architecture and next steps.

## Talk Track

Use this as your demo script:

> PathHome is a voice-first reentry and housing coordination platform for nonprofits, counties,
> shelters, and reentry teams. The goal is not to replace a case manager. The goal is to make intake
> faster, safer, and easier to review.
>
> This dashboard starts with live case data from PostgreSQL. Each row shows the person, status,
> priority, open needs, and when the case was opened. I seeded a realistic reentry case: a person
> released recently who needs a bed tonight and transportation to court tomorrow.
>
> On the case detail page, the system gives the operator a reviewable picture: timeline, redacted
> transcript, extracted needs, follow-ups, blockers, referral status, and enrichment summary. The
> important design principle is that PathHome is assistive, not autonomous. It can collect, summarize,
> and propose next steps, but a human still approves final housing, legal, benefits, or referral
> decisions.
>
> I also built a consent gate. A referral cannot be created unless a matching referral consent record
> exists. If consent is missing, the API fails closed and logs the blocked attempt. That matters
> because this product handles vulnerable-population data.
>
> Now I’ll show the browser voice path. In demo mode, the app uses a local scripted call so I can
> demo reliably without external voice credentials. The same session route creates a call session row
> and returns live or mock session metadata. The mock call shows turn-by-turn transcript capture,
> including shelter, court, transportation, and employment needs.
>
> The architecture is production-minded: Next.js on Vercel, Aurora PostgreSQL as the system of record,
> Zod validation at every boundary, parameterized SQL, PII-redacted transcript storage with TTL, and
> structured audit logging. The next production hardening steps are verifying the live AssemblyAI
> Voice Agent adapter, adding Vercel Workflow post-call enrichment, and enabling Twilio Media Streams
> for the phone edge.

## Mock Caller Transcript

If someone asks what the call contains, use this:

```text
Agent: You've reached PathHome intake. Can I get your first name?
Caller: It's Jordan. I was released today.
Agent: Thanks, Jordan. Do you have somewhere to stay tonight?
Caller: No, I need a bed tonight. And I have court tomorrow morning.
Agent: Understood. Do you need a ride to court?
Caller: Yes, I don't have transportation. I'm also looking for work.
Agent: Got it. I'm noting shelter, transport, and job support for a caseworker to follow up.
```

Expected system result:

- Shelter need, high urgency.
- Transport need, high urgency.
- Court/probation follow-up.
- Job support topic visible in transcript/enrichment.
- No final referral decision without consent and human review.

## Production Hardening Checklist

- Resolve `TODO(verify-docs)` comments in `lib/voice/assemblyai.ts` against AssemblyAI's current API.
- Add Vercel Workflow post-call enrichment route.
- Add RDS Proxy or Vercel/AWS OIDC database authentication before meaningful traffic.
- Add auth for operators before using real client data.
- Add row-level tenant scoping before multi-organization use.
- Add rate limits to tool routes.
- Store only redacted transcripts; keep TTL short.
- Add alerting on API errors, referral blocks, and DB connection pool exhaustion.

## Troubleshooting

- `DATABASE_URL is required`: set env vars locally and in Vercel before build.
- Dashboard is empty: run `npm run migrate` and `npm run seed`.
- Voice page uses mock mode: expected when `ASSEMBLYAI_API_KEY` is empty.
- Vercel build fails on DB import: confirm `DATABASE_URL` is configured for the Vercel environment.
- Too many DB connections: lower `PGPOOL_MAX` and add RDS Proxy.
