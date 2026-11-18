-- 第二期 分享与共同评价 (docs/design.zh.md §3.6). Who can see a list without joining it, whether
-- notes stay hidden until you hand in your own (盲评, on by default), and the key in the QR code that
-- lets a friend join. The key is kept as it is so the same QR code can be shown again; a new key makes
-- the old code stop working.
ALTER TABLE lists ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'; -- private / public
ALTER TABLE lists ADD COLUMN blind INTEGER NOT NULL DEFAULT 1;
-- Set when the owner reveals everyone's notes (揭晓): blind no longer applies, and a public list
-- shows the notes to visitors too.
ALTER TABLE lists ADD COLUMN revealed_at TEXT;
ALTER TABLE lists ADD COLUMN share_key TEXT;
ALTER TABLE lists ADD COLUMN join_open INTEGER NOT NULL DEFAULT 1;

CREATE INDEX list_members_user ON list_members(user_id);
CREATE INDEX tastings_item ON tastings(list_item_id);
