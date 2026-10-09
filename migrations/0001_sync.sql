-- Accounts (Sign in with Google) and per-user synced records.

CREATE TABLE users (
  id TEXT PRIMARY KEY,            -- 'g:<google sub>' ('dev:<name>' only in local development)
  email TEXT,
  name TEXT,
  picture TEXT,
  created INTEGER NOT NULL
);

-- Session cookies are random 256-bit tokens; only their SHA-256 is stored, so a DB leak can't sign anyone in.
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL
);
CREATE INDEX sessions_uid ON sessions (uid);

-- One row per synced record, last-writer-wins on the client timestamp.
-- k: meta:<doc> · pos:<doc> · marks:<doc> · cols · doc:<doc>:<ver>:<part> (gzipped book text)
-- seq: per-user change counter = pull cursor
CREATE TABLE rec (
  uid TEXT NOT NULL,
  k TEXT NOT NULL,
  at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  v BLOB NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (uid, k)
) WITHOUT ROWID;
CREATE INDEX rec_uid_seq ON rec (uid, seq);
