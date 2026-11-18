-- 开放注册 (Ke Li 2026-11-18): anyone may sign up with Google. A newcomer is let straight in while
-- today's free places last (settings.auto_approve_per_day), otherwise waits for an owner to approve.
-- Until approved they can keep notes but not use what costs money (label reading, place lookups).
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'; -- active / pending / disabled
ALTER TABLE users ADD COLUMN approved_at TEXT;
-- An owner's user id, or 'auto' for a free place, or 'owner' for an OWNER_EMAILS account.
ALTER TABLE users ADD COLUMN approved_by TEXT;
UPDATE users SET approved_at = created_at;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
