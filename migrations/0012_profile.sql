-- 昵称和头像 (Ke Li 2026-11-18), the badminton site's way (its 0046_avatars.sql):
-- users.name / users.picture stay what Google says at each sign-in; these are the person's own choice.
-- nickname: NULL = use the Google name.
-- avatar: NULL = use the Google picture, 'none' = no picture on purpose, else the id of their photo
-- in user_avatars (a new random id on every upload, so the image URL can be cached forever).
ALTER TABLE users ADD COLUMN nickname TEXT;
ALTER TABLE users ADD COLUMN avatar TEXT;

CREATE TABLE user_avatars (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id),
  image      BLOB NOT NULL,   -- JPEG, cropped square and shrunk on the phone first (~10-20 KB)
  created_at TEXT NOT NULL
);
CREATE INDEX user_avatars_user ON user_avatars (user_id);
