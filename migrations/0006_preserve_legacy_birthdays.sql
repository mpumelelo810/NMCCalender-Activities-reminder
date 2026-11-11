-- Preserve birthday classifications from the legacy title-based calendar logic.
-- Only backfill rows still marked as the default activity type. Committee
-- meetings and any explicitly assigned type are left unchanged.
UPDATE events
SET event_type = 'birthday'
WHERE event_type = 'activity'
  AND category <> 'meeting'
  AND TRIM(title) <> ''
  AND LOWER(TRIM(
    REPLACE(REPLACE(REPLACE(TRIM(title), ' / ', '/'), ' /', '/'), '/ ', '/')
  )) NOT IN (
    'back to school sunday',
    'bible trivia',
    'birthday celebration',
    'birthday celebrations',
    'career guidance',
    'charity activities',
    'church manual work',
    'committe meeting',
    'committee meeting',
    'culture day',
    'drama & skit night',
    'entreprenuership',
    'final year meeting',
    'leadership & training',
    'leadership training',
    'mentorship',
    'movie day',
    'picnic away',
    'picnic local',
    'sales',
    'special topic',
    'special topic/discussion',
    'special topic session/discussion',
    'sports day',
    'sports challenge/invites',
    'survival skills',
    'talent&art sessions',
    'team building',
    'worship & word evening',
    'youth day',
    'youth prayers',
    'youth service',
    'youth services',
    'youth sunday'
  );
