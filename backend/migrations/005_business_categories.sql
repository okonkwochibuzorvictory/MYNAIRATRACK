-- Business default categories (additive only).
-- Personal defaults stay untouched (is_business FALSE). New business
-- defaults are flagged TRUE so business forms can offer categories
-- that match business needs (sales, stock, salaries, shop costs).

ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS is_business BOOLEAN NOT NULL DEFAULT FALSE;
