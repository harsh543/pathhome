create extension if not exists pgcrypto;

create type case_status as enum ('open','in_progress','resolved','escalated');
create type need_category as enum ('shelter','transport','medication','id_docs','job_coaching','probation','food','other');
create type urgency_level as enum ('low','medium','high','critical');
create type referral_status as enum ('proposed','sent','accepted','declined','completed');
create type channel_type as enum ('phone','browser');

create table providers (
id uuid primary key default gen_random_uuid(),
name text not null,
type text not null,
neighborhood text,
capacity int,
contact jsonb,
created_at timestamptz default now()
);

create table people (
id uuid primary key default gen_random_uuid(),
first_name text,
last_name text,
phone text,
preferred_contact text,
notes text,
created_at timestamptz default now()
);

create table consent_records (
id uuid primary key default gen_random_uuid(),
person_id uuid references people(id),
scope text not null,
granted boolean not null,
method text not null,
granted_at timestamptz default now()
);

create table cases (
id uuid primary key default gen_random_uuid(),
person_id uuid references people(id),
status case_status not null default 'open',
priority urgency_level not null default 'medium',
opened_at timestamptz default now(),
closed_at timestamptz
);

create table needs (
id uuid primary key default gen_random_uuid(),
case_id uuid references cases(id),
category need_category not null,
description text,
urgency urgency_level not null default 'medium',
status text not null default 'open',
created_at timestamptz default now()
);

create table referrals (
id uuid primary key default gen_random_uuid(),
case_id uuid references cases(id),
need_id uuid references needs(id),
provider_id uuid references providers(id),
status referral_status not null default 'proposed',
notes text,
created_at timestamptz default now()
);

create table follow_ups (
id uuid primary key default gen_random_uuid(),
case_id uuid references cases(id),
description text not null,
due_at timestamptz,
assigned_to text,
status text not null default 'pending',
created_at timestamptz default now()
);

create table prompt_versions (
id uuid primary key default gen_random_uuid(),
name text not null,
version text not null,
system_prompt text not null,
params jsonb,
created_at timestamptz default now()
);

create table call_sessions (
id uuid primary key default gen_random_uuid(),
case_id uuid references cases(id),
person_id uuid references people(id),
channel channel_type not null,
prompt_version_id uuid references prompt_versions(id),
twilio_call_sid text,
disposition text,
started_at timestamptz default now(),
ended_at timestamptz
);

create table transcripts (
id uuid primary key default gen_random_uuid(),
call_session_id uuid references call_sessions(id),
turns jsonb not null,
redacted boolean not null default true,
ttl_expires_at timestamptz
);

create table enrichment_results (
id uuid primary key default gen_random_uuid(),
call_session_id uuid references call_sessions(id),
summary text,
urgency_overall urgency_level,
completion_status text,
entities jsonb,
topics jsonb,
blockers jsonb,
requires_human_followup boolean,
model text,
created_at timestamptz default now()
);

create table call_metrics (
id uuid primary key default gen_random_uuid(),
call_session_id uuid references call_sessions(id),
prompt_version_id uuid references prompt_versions(id),
interruption_count int,
mean_turn_latency_ms int,
entity_capture_rate numeric,
completion boolean,
failure_mode text,
created_at timestamptz default now()
);

create table audit_log (
id uuid primary key default gen_random_uuid(),
actor text not null,
action text not null,
entity text not null,
entity_id uuid,
meta jsonb,
at timestamptz default now()
);
