-- Migration 002: Closed Testing Invites & Administration

-- Users table enhancements for closed beta & moderation
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registered_with_invite TEXT;

-- Invite codes table
CREATE TABLE IF NOT EXISTS invite_codes (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'used', 'revoked', 'expired'
  note TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS invite_codes_code_idx ON invite_codes(code);
CREATE INDEX IF NOT EXISTS invite_codes_status_idx ON invite_codes(status);

-- Invite redemptions audit log
CREATE TABLE IF NOT EXISTS invite_uses (
  id SERIAL PRIMARY KEY,
  invite_id INTEGER NOT NULL REFERENCES invite_codes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS invite_uses_invite_idx ON invite_uses(invite_id);
CREATE INDEX IF NOT EXISTS invite_uses_user_idx ON invite_uses(user_id);
