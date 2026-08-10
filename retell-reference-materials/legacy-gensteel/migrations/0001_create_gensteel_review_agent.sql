CREATE SCHEMA IF NOT EXISTS gensteel_review_agent;

COMMENT ON SCHEMA gensteel_review_agent IS
  'GenSteel Retell review follow-up call orchestration and post-call outcome persistence.';

CREATE TABLE IF NOT EXISTS gensteel_review_agent.order_followups (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  order_id text NOT NULL,
  order_number text,
  customer_id text,
  customer_io_person_id text,
  salesforce_order_id text,
  salesforce_account_id text,
  customer_name text,
  customer_phone text NOT NULL,
  customer_email text,
  building_description text,
  delivery_date text,
  employee_name text,
  employee_role text,
  status text NOT NULL,
  call_id text UNIQUE,
  call_outcome text,
  review_email_sent boolean NOT NULL DEFAULT false,
  salesforce_updated boolean NOT NULL DEFAULT false,
  needs_escalation boolean NOT NULL DEFAULT false,
  raw_order_payload jsonb NOT NULL,
  retell_create_call_response jsonb,
  last_error text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (company_id, order_id)
);

CREATE INDEX IF NOT EXISTS order_followups_company_status_created_at_idx
  ON gensteel_review_agent.order_followups (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS order_followups_call_id_idx
  ON gensteel_review_agent.order_followups (call_id);

CREATE TABLE IF NOT EXISTS gensteel_review_agent.webhook_events (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  provider text NOT NULL,
  provider_event_id text,
  event_type text NOT NULL,
  call_id text,
  order_id text,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_id_unique_idx
  ON gensteel_review_agent.webhook_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS webhook_events_call_id_created_at_idx
  ON gensteel_review_agent.webhook_events (call_id, created_at DESC);

CREATE TABLE IF NOT EXISTS gensteel_review_agent.call_results (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  order_followup_id text REFERENCES gensteel_review_agent.order_followups (id) ON DELETE SET NULL,
  call_id text NOT NULL UNIQUE,
  call_summary text,
  call_successful boolean,
  user_sentiment text,
  experience_sentiment text,
  employee_sentiment text,
  review_requested boolean,
  review_consent boolean,
  confirmed_email text,
  needs_escalation boolean,
  issue_summary text,
  callback_time_preference text,
  call_outcome text,
  analysis jsonb NOT NULL,
  metadata jsonb NOT NULL,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS call_results_company_outcome_created_at_idx
  ON gensteel_review_agent.call_results (company_id, call_outcome, created_at DESC);
