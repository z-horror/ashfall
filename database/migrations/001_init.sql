CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL,
  username_lc   TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  CHAR(64) PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS characters (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  x           DOUBLE PRECISION NOT NULL,
  y           DOUBLE PRECISION NOT NULL,
  aim         DOUBLE PRECISION NOT NULL DEFAULT 0,
  hp          DOUBLE PRECISION NOT NULL DEFAULT 100,
  stamina     DOUBLE PRECISION NOT NULL DEFAULT 100,
  hunger      DOUBLE PRECISION NOT NULL DEFAULT 100,
  thirst      DOUBLE PRECISION NOT NULL DEFAULT 100,
  status      TEXT NOT NULL DEFAULT 'alive',
  dead_until  TIMESTAMPTZ,
  xp          INTEGER NOT NULL DEFAULT 0,
  kills       INTEGER NOT NULL DEFAULT 0,
  deaths      INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS character_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_key     TEXT NOT NULL,
  qty          INTEGER NOT NULL CHECK (qty > 0),
  durability   DOUBLE PRECISION NOT NULL DEFAULT 1,
  equipped     BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS character_items_char_idx ON character_items(character_id);
CREATE UNIQUE INDEX IF NOT EXISTS character_one_equipped ON character_items(character_id) WHERE equipped;

CREATE TABLE IF NOT EXISTS ground_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key    TEXT NOT NULL,
  qty         INTEGER NOT NULL CHECK (qty > 0),
  x           DOUBLE PRECISION NOT NULL,
  y           DOUBLE PRECISION NOT NULL,
  durability  DOUBLE PRECISION NOT NULL DEFAULT 1,
  dropped_by  INTEGER REFERENCES characters(id) ON DELETE SET NULL,
  dropped_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ground_items_pos_idx ON ground_items(x, y);

CREATE TABLE IF NOT EXISTS world_containers (
  id             TEXT PRIMARY KEY,
  container_type TEXT NOT NULL,
  x              INTEGER NOT NULL,
  y              INTEGER NOT NULL,
  generated      BOOLEAN NOT NULL DEFAULT false,
  opened         BOOLEAN NOT NULL DEFAULT false,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS container_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  container_id TEXT NOT NULL REFERENCES world_containers(id) ON DELETE CASCADE,
  item_key     TEXT NOT NULL,
  qty          INTEGER NOT NULL CHECK (qty > 0),
  durability   DOUBLE PRECISION NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS container_items_idx ON container_items(container_id);

CREATE TABLE IF NOT EXISTS world_doors (
  id         TEXT PRIMARY KEY,
  x          INTEGER NOT NULL,
  y          INTEGER NOT NULL,
  is_open    BOOLEAN NOT NULL DEFAULT false,
  locked     BOOLEAN NOT NULL DEFAULT false,
  hp         DOUBLE PRECISION NOT NULL DEFAULT 100,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_props (
  id         TEXT PRIMARY KEY,
  prop_type  TEXT NOT NULL,
  x          INTEGER NOT NULL,
  y          INTEGER NOT NULL,
  hp         DOUBLE PRECISION NOT NULL DEFAULT 100,
  destroyed  BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS world_zombies (
  id         TEXT PRIMARY KEY,
  chunk_x    INTEGER NOT NULL,
  chunk_y    INTEGER NOT NULL,
  type       INTEGER NOT NULL,
  x          DOUBLE PRECISION NOT NULL,
  y          DOUBLE PRECISION NOT NULL,
  aim        DOUBLE PRECISION NOT NULL DEFAULT 0,
  hp         DOUBLE PRECISION NOT NULL,
  state      TEXT NOT NULL DEFAULT 'idle',
  alive      BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS world_zombies_chunk_idx ON world_zombies(chunk_x, chunk_y);

CREATE TABLE IF NOT EXISTS world_chunks (
  cx         INTEGER NOT NULL,
  cy         INTEGER NOT NULL,
  seed       TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cx, cy)
);

CREATE TABLE IF NOT EXISTS world_events (
  id         BIGSERIAL PRIMARY KEY,
  kind       TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS world_events_created_idx ON world_events(created_at);

CREATE TABLE IF NOT EXISTS world_meta (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
