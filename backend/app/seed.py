"""Seed script (Phase 2).

Inserts the MVP currencies (NGN, USD, EUR, GBP) and the PRD default
categories. Safe to run repeatedly (uses ON CONFLICT DO NOTHING).
Usage: python -m app.seed  (run from the backend/ directory)
"""

import os

import psycopg
from dotenv import load_dotenv

load_dotenv()

CURRENCIES = [
    ("NGN", "Nigerian Naira", "\u20a6"),
    ("USD", "US Dollar", "$"),
    ("EUR", "Euro", "\u20ac"),
    ("GBP", "British Pound", "\u00a3"),
]

# PRD section 9 default expense categories.
DEFAULT_EXPENSE_CATEGORIES = [
    "Food",
    "Transportation",
    "Housing",
    "Utilities",
    "Data & Airtime",
    "Shopping",
    "Health",
    "Education",
    "Entertainment",
    "Family",
    "Debt",
    "Savings",
    "Other",
]

# PRD section 8.2 example income sources.
DEFAULT_INCOME_CATEGORIES = [
    "Salary",
    "Business",
    "Freelance",
    "Side hustle",
    "Gift",
    "Other",
]

# Business-mode default categories (is_business TRUE). Personal defaults
# above stay untouched; business forms offer these instead.
BUSINESS_INCOME_CATEGORIES = [
    "Sales of Goods",
    "Service Income",
    "Business Loan Received",
    "Sponsorship & Grants",
    "Commission Received",
    "Rental Income",
    "Business Other Income",
]

BUSINESS_EXPENSE_CATEGORIES = [
    "Cost of Goods Sold",
    "Staff Salaries",
    "Shop Rent",
    "Business Transport",
    "Marketing & Advertising",
    "Business Utilities",
    "Loan Repayment",
    "Business Other",
]


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def run_seed(database_url: str | None = None) -> dict:
    url = database_url or get_database_url()
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            for code, name, symbol in CURRENCIES:
                cur.execute(
                    """
                    INSERT INTO currencies (code, name, symbol)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (code) DO NOTHING
                    """,
                    (code, name, symbol),
                )
            for name in DEFAULT_EXPENSE_CATEGORIES:
                cur.execute(
                    """
                    INSERT INTO categories (user_id, name, type, is_default)
                    SELECT NULL, %s, 'expense', TRUE
                    WHERE NOT EXISTS (
                        SELECT 1 FROM categories
                        WHERE user_id IS NULL AND name = %s AND type = 'expense'
                    )
                    """,
                    (name, name),
                )
            for name in DEFAULT_INCOME_CATEGORIES:
                cur.execute(
                    """
                    INSERT INTO categories (user_id, name, type, is_default, is_business)
                    SELECT NULL, %s, 'income', TRUE, FALSE
                    WHERE NOT EXISTS (
                        SELECT 1 FROM categories
                        WHERE user_id IS NULL AND name = %s AND type = 'income'
                    )
                    """,
                    (name, name),
                )
            for name in BUSINESS_INCOME_CATEGORIES:
                cur.execute(
                    """
                    INSERT INTO categories (user_id, name, type, is_default, is_business)
                    SELECT NULL, %s, 'income', TRUE, TRUE
                    WHERE NOT EXISTS (
                        SELECT 1 FROM categories
                        WHERE user_id IS NULL AND name = %s AND type = 'income'
                    )
                    """,
                    (name, name),
                )
            for name in BUSINESS_EXPENSE_CATEGORIES:
                cur.execute(
                    """
                    INSERT INTO categories (user_id, name, type, is_default, is_business)
                    SELECT NULL, %s, 'expense', TRUE, TRUE
                    WHERE NOT EXISTS (
                        SELECT 1 FROM categories
                        WHERE user_id IS NULL AND name = %s AND type = 'expense'
                    )
                    """,
                    (name, name),
                )
            cur.execute("SELECT COUNT(*) FROM currencies")
            currency_count = cur.fetchone()[0]
            cur.execute(
                "SELECT COUNT(*) FROM categories WHERE is_default = TRUE"
            )
            category_count = cur.fetchone()[0]
        conn.commit()
    return {"currencies": currency_count, "default_categories": category_count}


if __name__ == "__main__":
    result = run_seed()
    print(result)
