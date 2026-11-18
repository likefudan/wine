-- 模型开销 (我的 → 开销): one row per request to a paid model, whatever it was for, with what it
-- used and what that cost at the price of the day. ok = 0: the model answered but the answer could
-- not be used (another model was tried next); it was still billed.
CREATE TABLE ai_calls (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  feature TEXT NOT NULL,
  model TEXT NOT NULL,
  ok INTEGER NOT NULL DEFAULT 1,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  web_searches INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX ai_calls_time ON ai_calls(created_at);

-- USD per million tokens (and per thousand web searches), editable on the page. Keyed by the
-- deployment name the code sends as `model`. Seeded with list prices of 2026-11: Claude on Foundry
-- bills at Anthropic's API rates; cache writes are 1.25 × input (5-minute cache); web search is
-- $10 per 1,000. The DeepSeek line is an estimate to be checked against the Azure bill.
CREATE TABLE model_prices (
  model TEXT PRIMARY KEY,
  input_per_mtok REAL NOT NULL,
  output_per_mtok REAL NOT NULL,
  cache_read_per_mtok REAL NOT NULL DEFAULT 0,
  cache_write_per_mtok REAL NOT NULL DEFAULT 0,
  search_per_k REAL NOT NULL DEFAULT 0,
  updated_at TEXT
);
INSERT INTO model_prices (model, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok, search_per_k) VALUES
  ('claude-opus-5-5', 4, 20, 0.2, 5, 10),
  ('claude-sonnet-5-5', 2, 10, 0.1, 2.5, 10),
  ('claude-fable-5-2', 8, 40, 0.2, 10, 10),
  ('claude-fable-5-2-fast', 16, 80, 0.4, 20, 10),
  ('claude-fable-5-1', 10, 50, 1, 12.5, 10),
  ('claude-haiku-5-5-2', 0.1, 0.5, 0.01, 0.125, 10),
  ('DeepSeek-V4.1-Flash-1017', 0.3, 1.2, 0, 0, 0);

-- Requests made before this table: the ones that recorded their tokens (labels, and 专业评价 when
-- that shipped first; its web searches were not recorded, so those rows miss the search fee).
INSERT INTO ai_calls (id, user_id, feature, model, ok, input_tokens, output_tokens, cost_usd, created_at)
SELECT j.id, j.user_id, j.kind, j.model, 1, j.input_tokens, COALESCE(j.output_tokens, 0),
  COALESCE((j.input_tokens * p.input_per_mtok + COALESCE(j.output_tokens, 0) * p.output_per_mtok) / 1000000.0, 0),
  j.created_at
FROM ai_jobs j LEFT JOIN model_prices p ON p.model = j.model
WHERE j.status = 'done' AND j.model IS NOT NULL AND j.input_tokens IS NOT NULL;
