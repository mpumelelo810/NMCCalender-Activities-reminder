CREATE TABLE events (
 id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 date TEXT NOT NULL CHECK(date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
 start_time TEXT NOT NULL, end_time TEXT, location TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
 category TEXT NOT NULL DEFAULT 'activity' CHECK(category IN ('activity','meeting')),
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)), cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX idx_events_date ON events(date);
CREATE TABLE admins (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id), expires_at TEXT NOT NULL);
CREATE TABLE notification_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, report_date TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('generated','sent','failed')), detail TEXT, created_at TEXT NOT NULL, UNIQUE(job,report_date));
CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id TEXT, action TEXT NOT NULL, target TEXT, at TEXT NOT NULL);
CREATE TABLE login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, window_started_at TEXT NOT NULL);
