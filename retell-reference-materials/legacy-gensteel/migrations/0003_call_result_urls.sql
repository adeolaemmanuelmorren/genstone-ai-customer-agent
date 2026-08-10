ALTER TABLE gensteel_review_agent.call_results
  ADD COLUMN IF NOT EXISTS retell_public_log_url text,
  ADD COLUMN IF NOT EXISTS retell_recording_url text;
