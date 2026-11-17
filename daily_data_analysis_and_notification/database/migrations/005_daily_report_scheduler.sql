CREATE TABLE IF NOT EXISTS daily_report_executions (
  execution_key TEXT PRIMARY KEY NOT NULL,
  reporting_date TEXT NOT NULL,
  generation_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  started_at TEXT,
  completed_at TEXT,
  lease_expires_at TEXT,
  error_message TEXT,
  UNIQUE (reporting_date, generation_key)
);

CREATE INDEX IF NOT EXISTS idx_daily_report_executions_status
  ON daily_report_executions(status, reporting_date);
