alter table genstone_customer_agent.order_candidates
  add column if not exists lookup_id text,
  add column if not exists candidate_rank integer,
  add column if not exists order_type_summary text,
  add column if not exists order_status_summary text;

create index if not exists order_candidates_lookup_idx
  on genstone_customer_agent.order_candidates (
    company_id,
    call_id,
    lookup_id,
    candidate_rank
  );
