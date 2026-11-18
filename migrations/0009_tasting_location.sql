-- Where a glass was tasted (记一杯 with the phone's position): JSON {lat, lng, accuracy, name, address,
-- placeId, geocoded}. Private: only the taster's own sync reads it, never a shared list's board.
ALTER TABLE tastings ADD COLUMN location TEXT;
-- 记下品酒地点: NULL = not asked yet, 1 = on, 0 = off.
ALTER TABLE users ADD COLUMN location_on INTEGER;
