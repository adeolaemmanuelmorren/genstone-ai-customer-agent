ALTER TABLE gensteel_review_agent.order_followups
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS test_run_id text,
  ADD COLUMN IF NOT EXISTS source_order_id text,
  ADD COLUMN IF NOT EXISTS source_order_number text,
  ADD COLUMN IF NOT EXISTS test_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE gensteel_review_agent.webhook_events
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS test_run_id text,
  ADD COLUMN IF NOT EXISTS source_order_id text;

ALTER TABLE gensteel_review_agent.call_results
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS test_run_id text,
  ADD COLUMN IF NOT EXISTS source_order_id text,
  ADD COLUMN IF NOT EXISTS test_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE gensteel_review_agent.outcome_actions
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS test_run_id text,
  ADD COLUMN IF NOT EXISTS source_order_id text;

ALTER TABLE gensteel_review_agent.review_email_templates
  ADD COLUMN IF NOT EXISTS test_send_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS test_last_selected_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS order_followups_company_test_run_unique_idx
  ON gensteel_review_agent.order_followups (company_id, test_run_id)
  WHERE test_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_followups_company_execution_created_at_idx
  ON gensteel_review_agent.order_followups (company_id, execution_mode, created_at DESC);

CREATE INDEX IF NOT EXISTS call_results_company_execution_created_at_idx
  ON gensteel_review_agent.call_results (company_id, execution_mode, created_at DESC);

CREATE INDEX IF NOT EXISTS outcome_actions_company_execution_created_at_idx
  ON gensteel_review_agent.outcome_actions (company_id, execution_mode, created_at DESC);
