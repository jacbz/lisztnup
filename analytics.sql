CREATE TABLE IF NOT EXISTS pageviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  country TEXT,
  path TEXT,
  user_hash TEXT,
  device TEXT,
  os TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  started_at DATETIME,
  ended_at DATETIME,
  state TEXT,
  mode TEXT,
  tracklist_id TEXT,
  country TEXT,
  user_hash TEXT,
  game_info TEXT
);

CREATE TABLE IF NOT EXISTS timeline_placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  work_gid TEXT,
  placed_correctly BOOLEAN,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
