drop index if exists genstone_customer_agent.tool_executions_idempotency_unique;

alter table genstone_customer_agent.tool_executions
  add column if not exists lease_id text,
  add column if not exists attempt_count integer not null default 1,
  add column if not exists result_ok boolean;

update genstone_customer_agent.tool_executions
set lease_id = id
where lease_id is null;

alter table genstone_customer_agent.tool_executions
  alter column lease_id set not null;

create unique index if not exists tool_executions_idempotency_unique
  on genstone_customer_agent.tool_executions (
    company_id,
    call_id,
    tool_name,
    idempotency_key,
    request_sha256
  )
  where idempotency_key is not null;

alter table genstone_customer_agent.call_sessions
  add column if not exists last_event_type text,
  add column if not exists primary_route text,
  add column if not exists call_outcome text,
  add column if not exists order_verified boolean,
  add column if not exists capability_gap_summary text;

drop table if exists genstone_customer_agent.support_case_references;
