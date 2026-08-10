create schema if not exists genstone_customer_agent;

create table if not exists genstone_customer_agent.call_sessions (
  id text primary key,
  company_id text not null,
  retell_call_id text not null,
  direction text,
  call_status text not null,
  started_at timestamptz,
  ended_at timestamptz,
  caller_phone text,
  called_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, retell_call_id)
);

create table if not exists genstone_customer_agent.provider_events (
  id text primary key,
  company_id text not null,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  call_id text,
  payload_object_key text,
  payload_sha256 text not null,
  payload_size_bytes integer not null,
  archive_status text not null default 'pending',
  processing_status text not null default 'received',
  attempt_count integer not null default 1,
  safe_error_code text,
  archived_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, provider, provider_event_id),
  check (archive_status in ('pending', 'archived', 'failed')),
  check (processing_status in ('received', 'processing', 'completed', 'failed'))
);

create table if not exists genstone_customer_agent.tool_executions (
  id text primary key,
  company_id text not null,
  call_id text not null,
  tool_name text not null,
  idempotency_key text,
  request_sha256 text not null,
  execution_status text not null,
  result_code text,
  safe_summary text,
  external_reference text,
  caller_safe_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (execution_status in ('started', 'completed', 'failed'))
);

create unique index if not exists tool_executions_idempotency_unique
  on genstone_customer_agent.tool_executions (company_id, tool_name, idempotency_key)
  where idempotency_key is not null;

create table if not exists genstone_customer_agent.order_candidates (
  token text primary key,
  company_id text not null,
  call_id text not null,
  woo_order_id text not null,
  order_number text not null,
  order_email text,
  masked_email text,
  caller_safe_items jsonb not null default '[]'::jsonb,
  order_verified boolean not null default false,
  phone_confirmed boolean not null default false,
  email_confirmed boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists genstone_customer_agent.contact_references (
  token text primary key,
  company_id text not null,
  call_id text not null,
  salesforce_contact_id text not null,
  contact_name text,
  confirmed_phone text,
  confirmed_email text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists genstone_customer_agent.outcomes (
  id text primary key,
  company_id text not null,
  call_id text not null,
  outcome_type text not null,
  outcome_status text not null,
  tool_execution_id text references genstone_customer_agent.tool_executions(id),
  provider text,
  external_reference text,
  safe_summary text,
  created_at timestamptz not null default now()
);

create table if not exists genstone_customer_agent.audit_events (
  id text primary key,
  company_id text not null,
  call_id text,
  event_name text not null,
  entity_type text not null,
  entity_id text not null,
  safe_context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists call_sessions_status_idx
  on genstone_customer_agent.call_sessions (company_id, call_status, updated_at desc);

create index if not exists provider_events_call_idx
  on genstone_customer_agent.provider_events (company_id, call_id, created_at desc);

create index if not exists provider_events_processing_idx
  on genstone_customer_agent.provider_events (company_id, processing_status, updated_at);

create index if not exists tool_executions_call_idx
  on genstone_customer_agent.tool_executions (company_id, call_id, created_at desc);

create index if not exists order_candidates_call_idx
  on genstone_customer_agent.order_candidates (company_id, call_id, created_at desc);

create index if not exists contact_references_call_idx
  on genstone_customer_agent.contact_references (company_id, call_id, created_at desc);

create index if not exists outcomes_call_idx
  on genstone_customer_agent.outcomes (company_id, call_id, created_at desc);

create index if not exists audit_events_entity_idx
  on genstone_customer_agent.audit_events (company_id, entity_type, entity_id, created_at desc);
