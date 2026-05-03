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
  placed_correctly BOOLEAN,
  turn_score INTEGER,
  seconds_taken REAL,
  streak_count INTEGER,
  gap INTEGER,
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
  deezer_id TEXT,
  composer TEXT,
  work TEXT,
  part TEXT,
  work_type TEXT,
  work_years TEXT
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

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  player_token TEXT NOT NULL,
  player_name TEXT,
  score INTEGER NOT NULL,
  cards INTEGER NOT NULL,
  accuracy REAL NOT NULL,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  tracklist_id TEXT,
  cards_to_win INTEGER NOT NULL,
  country TEXT,
  user_hash TEXT,
  session_id TEXT,
  timeline TEXT
);
