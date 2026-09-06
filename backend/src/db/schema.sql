-- ReachInbox Email Scheduler — schema
-- Design notes:
--  * `emails` is the single source of truth. BullMQ jobs only carry the
--    email's UUID as jobId (job id == idempotency key), so a crashed/replayed
--    job can never create a duplicate send: the worker always re-reads the
--    row from Postgres and checks `status` before touching SMTP.
--  * `bullmq_job_id = id` (same UUID) means we never need a separate mapping
--    table to correlate a BullMQ job back to a DB row after a restart.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS slack_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL,
  team_name TEXT,
  access_token TEXT NOT NULL,       -- bot token (xoxb-...)
  webhook_url TEXT,                 -- incoming webhook, if scope granted
  channel_id TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS senders (
  id TEXT PRIMARY KEY,              -- matches SENDERS_JSON config id
  name TEXT NOT NULL,
  email TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sender_id TEXT NOT NULL REFERENCES senders(id),
  start_time TIMESTAMPTZ NOT NULL,
  delay_between_emails_ms INTEGER NOT NULL,
  hourly_limit INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES senders(id),
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,      -- current target send time (mutated on reschedule)
  original_scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | processing | sent | failed | rescheduled
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  message_id TEXT,                          -- Ethereal message id / preview url
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_scheduled_time ON emails(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender_id);
CREATE INDEX IF NOT EXISTS idx_emails_campaign ON emails(campaign_id);

-- Every rate-limit deferral is logged for observability/demo purposes.
CREATE TABLE IF NOT EXISTS rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id TEXT NOT NULL,
  email_id UUID REFERENCES emails(id) ON DELETE CASCADE,
  hour_window TEXT NOT NULL,        -- e.g. 2026-09-05T14
  rescheduled_to TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
