ALTER TABLE events ADD COLUMN all_day INTEGER NOT NULL DEFAULT 0 CHECK(all_day IN (0,1));
ALTER TABLE events ADD COLUMN source_event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_source_event_id ON events(source_event_id);
