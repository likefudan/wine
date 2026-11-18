-- 专业评价 (docs/design.zh.md §3.2). One shared row per vintage, looked up once by Claude with web
-- search and kept for everyone; status pending / done / failed. `data` is a ProReview
-- (src/shared/reviews.ts) holding only scores, links and our own short summary, never review text.
CREATE TABLE pro_reviews (
  vintage_id TEXT PRIMARY KEY REFERENCES vintages(id),
  status TEXT NOT NULL,
  data TEXT,
  model TEXT,
  requested_by TEXT REFERENCES users(id),
  started_at TEXT NOT NULL,
  fetched_at TEXT,
  error TEXT
);

-- 用自己的 AI 查: what a person pasted back from their own AI. Only they see it; it is not checked,
-- not shared and not used for comparisons.
CREATE TABLE pro_review_imports (
  user_id TEXT NOT NULL REFERENCES users(id),
  vintage_id TEXT NOT NULL REFERENCES vintages(id),
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, vintage_id)
);

-- 报告错误 on a shared lookup, for the owner to look at.
CREATE TABLE pro_review_reports (
  id TEXT PRIMARY KEY,
  vintage_id TEXT NOT NULL REFERENCES vintages(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX ai_jobs_kind_day ON ai_jobs(kind, created_at);
