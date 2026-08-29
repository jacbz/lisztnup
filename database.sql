-- ============================================================================
-- Liszt'n Up! — D1 schema (target state)
--
-- Design rule: D1 bills *rows read*, which scales with table size x request
-- rate. Any query whose cost grows with total table size must not run in a
-- per-request path. Two mechanisms enforce that here:
--   1. Indexes  — every hot-path predicate is index-seekable (many covering).
--   2. Rollups  — `track_stats`, `leaderboard_best` and `metrics` are
--                 maintained on write (or lazily refreshed) so that reads are
--                 O(result size), not O(table size). Writes are cheap: the
--                 free tier allows 100k/day and we use ~2k.
-- ============================================================================

-- ─── Raw telemetry ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pageviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  country TEXT,
  path TEXT,
  user_hash TEXT,
  device TEXT,
  os TEXT,
  user_agent TEXT,
  referer TEXT,
  asn INTEGER,
  as_organization TEXT
);

-- Covering index for the hooks.server.ts 10-minute debounce: the query selects
-- no table columns, so it is answered from the index alone.
CREATE INDEX IF NOT EXISTS idx_pageviews_dedupe ON pageviews (user_hash, path, timestamp);
-- Covers the 24h unique-visitor metric as a range seek over just that window.
-- Referenced by an explicit INDEXED BY in homeStats.ts — see the note there for
-- why the planner must be overridden. Do not drop without updating that query.
CREATE INDEX IF NOT EXISTS idx_pageviews_recent ON pageviews (timestamp, user_hash);

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

CREATE INDEX IF NOT EXISTS idx_game_sessions_updated ON game_sessions (updated);

CREATE TABLE IF NOT EXISTS timeline_placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  work_gid TEXT,
  part_gid TEXT,
  deezer_id INTEGER,
  placement TEXT,
  placed_correctly BOOLEAN,
  turn_score INTEGER,
  seconds_taken REAL,
  streak_count INTEGER,
  gap INTEGER,
  distance INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_placements_session ON timeline_placements (session_id);
CREATE INDEX IF NOT EXISTS idx_placements_time ON timeline_placements (timestamp);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  context TEXT,
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_logs_time ON logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_session ON logs (session_id);

-- ─── User submissions ───────────────────────────────────────────────────────

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

-- ─── Leaderboard: source of truth ───────────────────────────────────────────

-- The replay blob lives in `timeline_score_logs`, not here, so that the
-- leaderboard indexes stay narrow and the rollup rebuild never pays to read
-- kilobytes of JSON it does not use. `has_log` mirrors its existence so the
-- ordering tiebreak and the UI's "show replay" affordance need no join.
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
  has_log INTEGER NOT NULL DEFAULT 0
);

-- Drives rebuildPlayerRollup(): the only read path into this table that runs
-- during a submission. Covering for everything the rebuild selects except the
-- narrow tail, which SQLite fetches by rowid.
CREATE INDEX IF NOT EXISTS idx_scores_token ON timeline_scores (player_token, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_scores_ratelimit ON timeline_scores (user_hash, timestamp);
CREATE INDEX IF NOT EXISTS idx_scores_session ON timeline_scores (session_id);

CREATE TABLE IF NOT EXISTS timeline_score_logs (
  score_id INTEGER PRIMARY KEY,
  log TEXT NOT NULL
);

-- ─── Leaderboard: rollup ────────────────────────────────────────────────────

-- One row per (period, player, name, tracklist, target) holding that player's
-- best score. This replaces the ROW_NUMBER() dedup CTE entirely: "best per
-- player" is now the primary key, so top-N is an index-ordered LIMIT.
--
-- `player_name` is NOT NULL with '' meaning anonymous. SQLite permits NULLs in
-- PRIMARY KEY columns of rowid tables, which would silently break uniqueness
-- for anonymous rows; '' avoids that. Mapped back to null on read.
--
-- `period_key` is 'all', or 'W:<cutoff>' / 'M:<cutoff>' where <cutoff> is the
-- exact D1 timestamp of the German week/month start — i.e. the key *is* the
-- period boundary, so keys and cutoffs can never drift apart.
--
-- `suppressed` precomputes the "hide a player's anonymous rows once they have
-- a better named row" rule at write time, so the read path is a plain filter.
CREATE TABLE IF NOT EXISTS leaderboard_best (
  period_key TEXT NOT NULL,
  player_token TEXT NOT NULL,
  player_name TEXT NOT NULL DEFAULT '',
  tracklist_id TEXT NOT NULL,
  target INTEGER NOT NULL,
  score INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  average_time REAL,
  longest_streak INTEGER,
  country TEXT,
  timestamp DATETIME NOT NULL,
  score_id INTEGER NOT NULL,
  has_log INTEGER NOT NULL DEFAULT 0,
  suppressed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (period_key, player_token, player_name, tracklist_id, target)
);

-- Ranking seek: matches the read path's ORDER BY exactly, so top-N reads ~limit
-- rows instead of scanning. Also serves the COUNT(*) rank probes.
CREATE INDEX IF NOT EXISTS idx_lb_best_rank
  ON leaderboard_best (period_key, suppressed, tracklist_id, target, score DESC, has_log DESC, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_lb_best_country
  ON leaderboard_best (period_key, suppressed, country, score DESC);
-- Rebuild deletes by token before reinserting.
CREATE INDEX IF NOT EXISTS idx_lb_best_token ON leaderboard_best (player_token);

-- ─── Track stats rollup ─────────────────────────────────────────────────────

-- Maintained by an UPSERT alongside every timeline_placements insert, turning
-- the per-card GET /api/game/track-stats from a full scan into a PK lookup.
CREATE TABLE IF NOT EXISTS track_stats (
  part_gid TEXT PRIMARY KEY,
  played INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0
);

-- ─── Lazily materialized global metrics ─────────────────────────────────────

-- Cloudflare Pages has no Cron Triggers, so expensive global aggregates are
-- refreshed read-through: serve the stored value (1 row read), and if it is
-- older than its TTL recompute in waitUntil() after the response is sent.
CREATE TABLE IF NOT EXISTS metrics (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
