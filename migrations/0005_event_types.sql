-- Add explicit event types while preserving all existing event records.
ALTER TABLE events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'activity'
  CHECK(event_type IN ('birthday','activity','meeting'));
UPDATE events SET event_type='meeting' WHERE category='meeting';
