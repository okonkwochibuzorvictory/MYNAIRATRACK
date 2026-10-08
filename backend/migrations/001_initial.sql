-- Phase 2 initial schema (V1).
-- Matches backend/app/models.py. All currency columns reference
-- currencies(code) so only the MVP currencies can be stored.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS currencies (
    code VARCHAR(3) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    symbol VARCHAR(8) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(256) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    primary_currency VARCHAR(3) NOT NULL DEFAULT 'NGN' REFERENCES currencies(code),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exchange_rates (
    id SERIAL PRIMARY KEY,
    from_currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    to_currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    rate NUMERIC(18, 8) NOT NULL,
    provider VARCHAR(64) NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_rate_pair UNIQUE (from_currency, to_currency),
    CONSTRAINT ck_rate_positive CHECK (rate > 0),
    CONSTRAINT ck_rate_distinct_pair CHECK (from_currency <> to_currency)
);

CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    is_business BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    type VARCHAR(16) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT ck_category_type CHECK (type IN ('income', 'expense'))
);

CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type VARCHAR(16) NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    category_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    payment_method VARCHAR(64) NULL,
    note TEXT NULL,
    is_business BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_txn_amount_non_negative CHECK (amount >= 0),
    CONSTRAINT ck_txn_type CHECK (type IN ('income', 'expense', 'sale'))
);

CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    amount NUMERIC(18, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_budget_amount_non_negative CHECK (amount >= 0),
    CONSTRAINT ck_budget_period CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS budget_allocations (
    id SERIAL PRIMARY KEY,
    budget_id INTEGER NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    allocated_amount NUMERIC(18, 2) NOT NULL,
    CONSTRAINT ck_allocation_non_negative CHECK (allocated_amount >= 0)
);

CREATE TABLE IF NOT EXISTS savings_targets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    target_amount NUMERIC(18, 2) NOT NULL,
    current_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_savings_target_non_negative CHECK (target_amount >= 0),
    CONSTRAINT ck_savings_current_non_negative CHECK (current_amount >= 0)
);

CREATE TABLE IF NOT EXISTS goals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    target_amount NUMERIC(18, 2) NOT NULL,
    current_amount NUMERIC(18, 2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL REFERENCES currencies(code),
    deadline DATE NULL,
    suggested_contribution NUMERIC(18, 2) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_goal_target_non_negative CHECK (target_amount >= 0),
    CONSTRAINT ck_goal_current_non_negative CHECK (current_amount >= 0)
);

CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    budget_id INTEGER NULL REFERENCES budgets(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
