CREATE TABLE IF NOT EXISTS notification_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  report_date TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','sent','failed')),
  message_id TEXT,
  detail TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(job, report_date, recipient)
);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_date
  ON notification_deliveries(report_date, status);
