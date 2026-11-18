-- 酒庄地址: the Google Places place picked when the producer was typed in (Places API, New).
ALTER TABLE producers ADD COLUMN place_id TEXT;
ALTER TABLE producers ADD COLUMN address TEXT;
ALTER TABLE producers ADD COLUMN lat REAL;
ALTER TABLE producers ADD COLUMN lng REAL;
