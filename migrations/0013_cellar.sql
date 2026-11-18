-- 酒窖 (docs/design.zh.md §6, 第三期). One row per purchase ("lot") of one vintage: bottles left, size,
-- where they are, what they cost, my drinking window. ids are ULIDs made on the phone, like tastings.
CREATE TABLE cellar (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  vintage_id TEXT NOT NULL REFERENCES vintages(id),
  -- bottles left; 0 = all drunk, kept as history
  qty INTEGER NOT NULL,
  size_ml INTEGER NOT NULL DEFAULT 750,
  location TEXT,
  bought_on TEXT,
  -- per bottle, in `currency` (ISO 4217)
  price REAL,
  currency TEXT,
  source TEXT,
  -- years; NULL = not set (the critics' window or my notes' is used instead)
  drink_from INTEGER,
  drink_to INTEGER,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX cellar_user ON cellar(user_id);
CREATE INDEX cellar_vintage ON cellar(vintage_id);

-- 开一瓶: the lot a tasting's bottle came out of.
ALTER TABLE tastings ADD COLUMN cellar_id TEXT;
