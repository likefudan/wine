-- 盲品 (docs/design.zh.md §11): a glass tasted before anyone knows which wine it is. Until the answer is in,
-- the tasting (and, in a 品鉴, its list item) points at this one placeholder vintage, so vintage_id stays
-- NOT NULL everywhere. Its names are empty so the catalogue search never finds it.
INSERT OR IGNORE INTO producers (id, name, name_key, created_at)
  VALUES ('00000000000000000000000000', '', '', '2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO wines (id, producer_id, name, name_key, color, grapes, created_at)
  VALUES ('00000000000000000000000000', '00000000000000000000000000', '', '', 'red', '[]', '2026-11-18T00:00:00.000Z');
INSERT OR IGNORE INTO vintages (id, wine_id, year, created_at)
  VALUES ('00000000000000000000000000', '00000000000000000000000000', 0, '2026-11-18T00:00:00.000Z');

-- {"label":"#3","color":"red"}: the glass's own name and the colour seen in it. Kept after the answer.
ALTER TABLE tastings ADD COLUMN blind TEXT;
ALTER TABLE list_items ADD COLUMN blind TEXT;
-- The host's answer, seen only by the host until 揭晓 copies it into vintage_id.
ALTER TABLE list_items ADD COLUMN answer_vintage_id TEXT;
