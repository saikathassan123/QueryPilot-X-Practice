ALTER TABLE daily_analysis_reports ADD COLUMN generation_key TEXT;
ALTER TABLE daily_analysis_reports ADD COLUMN generation_status TEXT NOT NULL DEFAULT 'generated'
  CHECK (generation_status IN ('generated', 'failed'));
ALTER TABLE daily_analysis_reports ADD COLUMN pdf_status TEXT NOT NULL DEFAULT 'not_generated'
  CHECK (pdf_status IN ('not_generated', 'generated', 'failed'));
ALTER TABLE daily_analysis_reports ADD COLUMN pdf_filename TEXT;
ALTER TABLE daily_analysis_reports ADD COLUMN pdf_generated_at TEXT;
ALTER TABLE daily_analysis_reports ADD COLUMN pdf_size_bytes INTEGER
  CHECK (pdf_size_bytes IS NULL OR pdf_size_bytes >= 0);
ALTER TABLE daily_analysis_reports ADD COLUMN pdf_error TEXT;

UPDATE daily_analysis_reports
SET generation_key = 'legacy-' || id
WHERE generation_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_analysis_reports_generation_key
  ON daily_analysis_reports(generation_key);

CREATE INDEX IF NOT EXISTS idx_daily_analysis_reports_reporting_date
  ON daily_analysis_reports(reporting_date DESC, id DESC);
