ALTER TABLE gensteel_review_agent.order_followups
  ADD COLUMN IF NOT EXISTS outcome_workflow_instance_id text,
  ADD COLUMN IF NOT EXISTS outcome_workflow_status text,
  ADD COLUMN IF NOT EXISTS slack_notified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS callback_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS callback_notified_at timestamptz;

ALTER TABLE gensteel_review_agent.call_results
  ADD COLUMN IF NOT EXISTS outcome_workflow_instance_id text,
  ADD COLUMN IF NOT EXISTS workflow_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS workflow_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS workflow_status text;

CREATE TABLE IF NOT EXISTS gensteel_review_agent.review_email_templates (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  template_key text NOT NULL,
  review_destination text NOT NULL,
  customerio_transactional_message_id text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  gmail_only boolean NOT NULL DEFAULT false,
  send_count integer NOT NULL DEFAULT 0,
  last_selected_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE (company_id, template_key)
);

CREATE INDEX IF NOT EXISTS review_email_templates_rotation_idx
  ON gensteel_review_agent.review_email_templates (
    company_id,
    enabled,
    gmail_only,
    send_count,
    last_selected_at
  );

CREATE TABLE IF NOT EXISTS gensteel_review_agent.outcome_actions (
  id text PRIMARY KEY,
  company_id text NOT NULL,
  order_followup_id text REFERENCES gensteel_review_agent.order_followups (id) ON DELETE SET NULL,
  call_id text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL,
  provider text,
  provider_message_id text,
  template_key text,
  review_destination text,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS outcome_actions_call_id_type_idx
  ON gensteel_review_agent.outcome_actions (call_id, action_type, created_at DESC);
