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
  started DATETIME,
  updated DATETIME,
  state TEXT,
  mode TEXT,
  tracklist_id TEXT,
  country TEXT,
  locale TEXT,
  user_hash TEXT,
  game_info TEXT
);

CREATE TABLE IF NOT EXISTS timeline_placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  work_gid TEXT,
  part_gid TEXT,
  placement TEXT,
  placed_correctly BOOLEAN,
  turn_score INTEGER,
  seconds_taken REAL,
  streak_count INTEGER,
  gap INTEGER,
  distance INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS problem_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  session_id TEXT,
  user_hash TEXT,
  country TEXT,
  message TEXT,
  email TEXT,
  track_metadata TEXT
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  session_id TEXT,
  user_hash TEXT,
  country TEXT,
  message TEXT,
  email TEXT
);

CREATE TABLE IF NOT EXISTS timeline_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  player_token TEXT NOT NULL,
  player_name TEXT,
  score INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  target INTEGER NOT NULL,
  average_time REAL,
  longest_streak INTEGER,
  tracklist_id TEXT NOT NULL,
  country TEXT,
  user_hash TEXT,
  session_id TEXT,
  log TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT,
  session_id TEXT
);
