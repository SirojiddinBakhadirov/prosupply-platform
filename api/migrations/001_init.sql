-- ProSupply: boşlanğiç sxema
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'manager' CHECK (role IN ('owner','manager','viewer')),
  pass_hash   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id          SERIAL PRIMARY KEY,
  org         TEXT NOT NULL,
  contact     TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL,
  segment     TEXT NOT NULL DEFAULT '',
  items       TEXT NOT NULL DEFAULT '',
  lang        TEXT NOT NULL DEFAULT 'uz',
  source      TEXT NOT NULL DEFAULT 'sayt',
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_work','kp_sent','won','lost')),
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_created_idx ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);

CREATE TABLE IF NOT EXISTS lead_events (
  id          SERIAL PRIMARY KEY,
  lead_id     INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id     INT REFERENCES users(id),
  action      TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
