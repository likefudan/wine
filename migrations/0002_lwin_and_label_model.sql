-- 输入联想的公共酒款库：LWIN (Liv-ex Wine Identification Number), free under a Creative Commons
-- licence (credit: Liv-ex). The rows are not in this repository: scripts/lwin_import.py turns the
-- downloaded spreadsheet into SQL that is loaded into each database (README「LWIN」).
CREATE TABLE lwin (
  lwin INTEGER PRIMARY KEY,
  producer TEXT NOT NULL,
  wine TEXT NOT NULL,
  -- red / white / rose / sparkling / dessert, or NULL when LWIN does not say
  color TEXT,
  country TEXT,
  region TEXT,
  appellation TEXT,
  classification TEXT
);

-- One row per search word of a wine (its producer, name and appellation, through nameKey(), filler words left
-- out), so a prefix lookup reads an index range instead of every wine. No FTS5: D1 cannot export a
-- database with virtual tables.
CREATE TABLE lwin_words (
  word TEXT NOT NULL,
  lwin INTEGER NOT NULL,
  PRIMARY KEY (word, lwin)
) WITHOUT ROWID;

-- The LWIN a wine in our catalogue was picked from, for later (pro reviews, matching).
ALTER TABLE wines ADD COLUMN lwin INTEGER;

-- 拍酒标用哪个模型 (設定). NULL = the default, LABEL_MODELS[0] in src/shared/model.ts.
ALTER TABLE users ADD COLUMN label_model TEXT;
