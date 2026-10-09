ALTER TABLE admins ADD COLUMN phone TEXT;
ALTER TABLE admins ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'organiser' CHECK(role IN ('administrator','organiser'));
ALTER TABLE admins ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
CREATE UNIQUE INDEX IF NOT EXISTS idx_admins_phone ON admins(phone);
