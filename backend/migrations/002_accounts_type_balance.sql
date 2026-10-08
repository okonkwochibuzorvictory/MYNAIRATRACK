-- Phase 5: account type + opening balance (V2).
-- Currency stays immutable (no column change there); the native balance
-- is the opening balance plus same-currency transactions (computed in
-- the API, never stored or converted).

ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS account_type VARCHAR(32) NOT NULL DEFAULT 'Other';

ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(18, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_account_type'
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT ck_account_type CHECK (
            account_type IN ('Bank Account', 'Cash', 'Mobile Money', 'Savings', 'Other')
        );
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_account_opening_non_negative'
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT ck_account_opening_non_negative CHECK (
            opening_balance >= 0
        );
    END IF;
END $$;
