-- 品酒日记 第一期 (docs/design.zh.md §4). IDs are ULIDs made on the phone, so a record created
-- offline keeps its id when it is uploaded.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  locale TEXT,
  -- Default tasting depth: quick / beginner / standard / expert. NULL until chosen at first login.
  depth TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Who may sign in besides OWNER_EMAILS: the owner adds friends' Google emails in 我的.
CREATE TABLE invites (
  email TEXT PRIMARY KEY,
  invited_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE producers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  country TEXT,
  region TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE wines (
  id TEXT PRIMARY KEY,
  producer_id TEXT NOT NULL REFERENCES producers(id),
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  -- red / white / rose / sparkling / dessert
  color TEXT NOT NULL,
  appellation TEXT,
  grapes TEXT NOT NULL DEFAULT '[]',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (producer_id, name_key)
);
CREATE INDEX wines_name_key ON wines(name_key);

CREATE TABLE vintages (
  id TEXT PRIMARY KEY,
  wine_id TEXT NOT NULL REFERENCES wines(id),
  -- 0 = NV
  year INTEGER NOT NULL,
  abv REAL,
  created_at TEXT NOT NULL,
  UNIQUE (wine_id, year)
);

-- A vintage made on a phone that turned out to exist already: its id keeps pointing at the one kept,
-- so notes written offline against the phone's id still land on the right wine.
CREATE TABLE vintage_aliases (
  alias_id TEXT PRIMARY KEY,
  vintage_id TEXT NOT NULL REFERENCES vintages(id)
);

CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  -- winery / trip / dinner / home
  kind TEXT NOT NULL DEFAULT 'winery',
  starts_on TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX lists_owner ON lists(owner_id);

CREATE TABLE list_members (
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (list_id, user_id)
);

CREATE TABLE list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  vintage_id TEXT NOT NULL REFERENCES vintages(id),
  position INTEGER NOT NULL,
  price_usd REAL,
  added_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX list_items_list ON list_items(list_id);

CREATE TABLE tastings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  vintage_id TEXT NOT NULL REFERENCES vintages(id),
  list_item_id TEXT REFERENCES list_items(id) ON DELETE SET NULL,
  tasted_at TEXT NOT NULL,
  -- quick / beginner / standard / expert: the depth it was last written at
  depth TEXT NOT NULL,
  appearance TEXT NOT NULL DEFAULT '{}',
  nose TEXT NOT NULL DEFAULT '{}',
  palate TEXT NOT NULL DEFAULT '{}',
  -- faults, serving, drink window, quality reasons
  extra TEXT NOT NULL DEFAULT '{}',
  guesses TEXT NOT NULL DEFAULT '{}',
  quality TEXT,
  -- 我的分: how much I liked it, 50-100
  score INTEGER,
  buy_again INTEGER,
  bought_qty INTEGER,
  price_usd REAL,
  note TEXT,
  photo_id TEXT,
  status TEXT NOT NULL DEFAULT 'done',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX tastings_user ON tastings(user_id);
CREATE INDEX tastings_vintage ON tastings(vintage_id);
CREATE UNIQUE INDEX tastings_item_user ON tastings(list_item_id, user_id) WHERE list_item_id IS NOT NULL;

-- Aroma words from the shared vocabulary (src/shared/descriptors.ts), one row each: the base of
-- "me vs the critics" and recommendations later.
CREATE TABLE tasting_descriptors (
  tasting_id TEXT NOT NULL REFERENCES tastings(id) ON DELETE CASCADE,
  descriptor_id TEXT NOT NULL,
  intensity INTEGER NOT NULL DEFAULT 2,
  PRIMARY KEY (tasting_id, descriptor_id)
);
CREATE INDEX tasting_descriptors_descriptor ON tasting_descriptors(descriptor_id);

CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  r2_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Every AI call: the daily cap per person and what it cost.
CREATE TABLE ai_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX ai_jobs_user_day ON ai_jobs(user_id, created_at);
