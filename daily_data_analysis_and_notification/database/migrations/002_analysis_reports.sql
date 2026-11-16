CREATE TABLE IF NOT EXISTS daily_analysis_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_kind TEXT NOT NULL CHECK (report_kind IN ('automatic', 'historical')),
  reporting_date TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  comparison_days INTEGER,
  comparison_start TEXT,
  comparison_end TEXT,
  report_json TEXT NOT NULL CHECK (length(report_json) > 2),
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_analysis_reports_generated_at
  ON daily_analysis_reports(generated_at DESC);

CREATE TABLE IF NOT EXISTS daily_analysis_preferences (
  preference_key TEXT PRIMARY KEY NOT NULL,
  preference_value TEXT NOT NULL
);
