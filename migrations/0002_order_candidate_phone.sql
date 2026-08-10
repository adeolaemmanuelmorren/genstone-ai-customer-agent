alter table genstone_customer_agent.order_candidates
  add column if not exists order_phone text;
