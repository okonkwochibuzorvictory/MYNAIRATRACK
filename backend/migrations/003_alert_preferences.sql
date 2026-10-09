-- Phase 10: per-user alert preferences (V3, additive only).
-- One master row per user (budget_id IS NULL) holding the master switch
-- and default thresholds; one row per budget per user for overrides.
-- Partial unique indexes enforce both shapes. Nothing existing changes.

CREATE TABLE IF NOT EXISTS alert_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    budget_id INTEGER NULL REFERENCES budgets(id) ON DELETE CASCADE,
    alert_50 BOOLEAN NOT NULL DEFAULT FALSE,
    alert_80 BOOLEAN NOT NULL DEFAULT TRUE,
    alert_100 BOOLEAN NOT NULL DEFAULT TRUE,
    alert_over BOOLEAN NOT NULL DEFAULT TRUE,
    alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prefs_master
    ON alert_preferences (user_id) WHERE budget_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_prefs_budget
    ON alert_preferences (user_id, budget_id) WHERE budget_id IS NOT NULL;

-- Dedup support for budget alerts: threshold alerts are unique per
-- (budget, threshold, budget period). Nullable so non-budget alerts
-- (future) are unaffected.
ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS period_start DATE NULL;

ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS period_end DATE NULL;
