-- Email verification + password reset (additive only).
-- users.is_verified defaults FALSE for new rows; existing accounts are
-- grandfathered as verified so nobody is locked out by this change.
-- auth_tokens stores SHA-256 hashes only, never raw tokens.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users SET is_verified = TRUE WHERE is_verified = FALSE;

CREATE TABLE IF NOT EXISTS auth_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    purpose VARCHAR(16) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_auth_token_purpose CHECK (purpose IN ('verify', 'reset'))
);
