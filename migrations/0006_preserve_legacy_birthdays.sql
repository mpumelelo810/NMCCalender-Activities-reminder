-- This migration intentionally does not infer event types from event titles.
-- Birthdays, activities, and meetings must be assigned explicitly by an organiser.
-- SELECT 1 records a harmless migration step without changing existing event data.
SELECT 1;
