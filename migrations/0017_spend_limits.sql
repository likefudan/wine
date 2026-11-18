-- 花费上限 (review 2026-11-18): Google Places calls are written down in ai_calls too (feature
-- 'places', one web_search per call, priced per thousand), and a site-wide daily budget for every
-- paid call can be set on 我的 → 开销. Google list prices of 2026-11, editable on the page.
INSERT OR IGNORE INTO model_prices (model, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok, search_per_k) VALUES
  ('google-places-autocomplete', 0, 0, 0, 0, 2.83),
  ('google-place-details', 0, 0, 0, 0, 5),
  ('google-places-nearby', 0, 0, 0, 0, 32),
  ('google-geocode', 0, 0, 0, 0, 5);

-- Per person, per feature, per day: label/prose/places allowances read this.
CREATE INDEX IF NOT EXISTS ai_calls_user_feature ON ai_calls(user_id, feature, created_at);
CREATE INDEX IF NOT EXISTS ai_jobs_user_kind ON ai_jobs(user_id, kind, created_at);
