-- Phase 11: Business Mode activation + business budgets (V4, additive only).
-- business_mode defaults OFF for all existing and new users; nothing is
-- converted. budgets.is_business defaults FALSE (personal); existing
-- budgets stay personal. No existing columns change.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS business_mode BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE budgets
    ADD COLUMN IF NOT EXISTS is_business BOOLEAN NOT NULL DEFAULT FALSE;
