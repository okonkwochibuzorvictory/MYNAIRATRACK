"""Phase 2 tests: migrations, seed data, and currency constraints.

Run against the isolated test database only (mynairatrack_test).
Usage: python -m pytest tests/test_phase2.py -v  (run from backend/)
"""

import os

import psycopg
import pytest

from app.migrate import apply_migrations
from app.seed import run_seed

TEST_DATABASE_URL = "postgresql://mynaira:mynaira@localhost:5432/mynairatrack_test"


@pytest.fixture()
def test_db():
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                DO $$ DECLARE r RECORD; BEGIN
                    FOR r IN (SELECT tablename FROM pg_tables
                              WHERE schemaname = 'public') LOOP
                        EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename)
                                || ' CASCADE';
                    END LOOP;
                END $$;
                """
            )
        conn.commit()
    apply_migrations(TEST_DATABASE_URL)
    run_seed(TEST_DATABASE_URL)
    yield TEST_DATABASE_URL


def query(url, sql, params=None):
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or ())
            rows = cur.fetchall() if cur.description is not None else []
        conn.commit()
        return rows


def test_migrations_apply_cleanly(test_db):
    rows = query(test_db, "SELECT version FROM schema_migrations")
    assert ("001_initial",) in rows


def test_migrations_are_idempotent(test_db):
    assert apply_migrations(test_db) == []


def test_seed_is_idempotent(test_db):
    first = run_seed(test_db)
    second = run_seed(test_db)
    assert first == second == {"currencies": 4, "default_categories": 19}


def test_mvp_currencies_present(test_db):
    rows = query(test_db, "SELECT code FROM currencies ORDER BY code")
    assert [r[0] for r in rows] == ["EUR", "GBP", "NGN", "USD"]


def test_only_mvp_currencies_seeded(test_db):
    rows = query(test_db, "SELECT COUNT(*) FROM currencies")
    assert rows[0][0] == 4


def test_transaction_rejects_unknown_currency(test_db):
    query(
        test_db,
        """
        INSERT INTO users (name, email, password_hash, primary_currency)
        VALUES ('Test', 't@example.com', 'x', 'NGN')
        """,
    )
    query(
        test_db,
        """
        INSERT INTO accounts (user_id, name, currency)
        VALUES (1, 'Main', 'NGN')
        """,
    )
    with pytest.raises(Exception):
        query(
            test_db,
            """
            INSERT INTO transactions
                (user_id, account_id, type, amount, currency, date)
            VALUES (1, 1, 'expense', 100, 'JPY', CURRENT_DATE)
            """,
        )


def test_default_categories_seeded(test_db):
    rows = query(
        test_db,
        "SELECT COUNT(*) FROM categories WHERE is_default = TRUE AND type = 'expense'",
    )
    assert rows[0][0] == 13
    rows = query(
        test_db,
        "SELECT COUNT(*) FROM categories WHERE is_default = TRUE AND type = 'income'",
    )
    assert rows[0][0] == 6


def test_negative_amount_rejected(test_db):
    with pytest.raises(Exception):
        query(
            test_db,
            """
            INSERT INTO budgets
                (user_id, name, amount, currency, period_start, period_end)
            VALUES (1, 'Bad', -5, 'NGN', CURRENT_DATE, CURRENT_DATE)
            """,
        )


def test_all_expected_tables_exist(test_db):
    rows = query(
        test_db,
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    )
    names = [r[0] for r in rows]
    for expected in [
        "accounts",
        "alerts",
        "budget_allocations",
        "budgets",
        "categories",
        "currencies",
        "exchange_rates",
        "goals",
        "savings_targets",
        "schema_migrations",
        "transactions",
        "users",
    ]:
        assert expected in names


def test_models_match_migrated_schema(test_db):
    from app import models
    from app.models import Base

    model_tables = set(Base.metadata.tables.keys())
    rows = query(
        test_db,
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    )
    db_tables = {r[0] for r in rows} - {"schema_migrations"}
    assert model_tables == db_tables
