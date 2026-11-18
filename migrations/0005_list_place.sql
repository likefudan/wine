-- 酒单地点: where a 酒单 happens (the winery, restaurant or town), typed or picked from Google Places.
ALTER TABLE lists ADD COLUMN place_name TEXT;
ALTER TABLE lists ADD COLUMN place_id TEXT;
ALTER TABLE lists ADD COLUMN place_address TEXT;
ALTER TABLE lists ADD COLUMN place_lat REAL;
ALTER TABLE lists ADD COLUMN place_lng REAL;
