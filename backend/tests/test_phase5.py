"""Phase 5 tests: accounts/wallets CRUD, currency immutability, isolation.

Run against the isolated test database only (mynairatrack_test).
Usage: python -m pytest tests/test_phase5.py -v  (run from backend/)
"""

import os
from datetime import date
from decimal import Decimal

os.environ["JWT_SECRET"] = "phase5-test-secret-do-not-use-in-prod"
os.environ["JWT_EXPIRE_MINUTES"] = "60"
os.environ["COOKIE_SECURE"] = "false"
os.environ["RESEND_API_KEY"] = ""

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import auth as auth_module
from app.main import app
from app.migrate import apply_migrations
from app.seed import run_seed

TEST_DATABASE_URL = "postgresql://mynaira:mynaira@localhost:5432/mynairatrack_test"


@pytest.fixture()
def reset_db():
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
    applied = apply_migrations(TEST_DATABASE_URL)
    assert "002_accounts_type_balance" in applied
    run_seed(TEST_DATABASE_URL)
    yield TEST_DATABASE_URL


@pytest.fixture()
def client(reset_db):
    engine = create_engine(TEST_DATABASE_URL)
    TestingSession = sessionmaker(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[auth_module.get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    engine.dispose()


def register(client, name="Acct User", email="acct@example.com"):
    r = client.post(
        "/auth/register",
        json={"name": name, "email": email, "password": "Pass1234"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def create_account(client, **overrides):
    payload = {
        "name": "Main Bank",
        "currency": "NGN",
        "account_type": "Bank Account",
        "opening_balance": "5000",
    }
    payload.update(overrides)
    return client.post("/accounts", json=payload)


def add_txn(user_id, account_id, txn_type, amount, currency):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO transactions
                    (user_id, account_id, type, amount, currency, date)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (user_id, account_id, txn_type, str(amount), currency, date(2026, 1, 5)),
            )
        conn.commit()


def test_migration_002_applied(client):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT version FROM schema_migrations ORDER BY version")
            versions = [r[0] for r in cur.fetchall()]
    assert "001_initial" in versions
    assert "002_accounts_type_balance" in versions


def test_create_account(client):
    register(client)
    r = create_account(client)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Main Bank"
    assert body["currency"] == "NGN"
    assert body["account_type"] == "Bank Account"
    assert body["is_business"] is False
    assert Decimal(body["balance"]) == Decimal("5000")


def test_create_account_defaults(client):
    register(client)
    r = client.post("/accounts", json={"name": "Cash", "currency": "USD"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["account_type"] == "Other"
    assert Decimal(body["balance"]) == Decimal("0")


def test_list_accounts_only_own(client):
    register(client, email="a@example.com")
    assert create_account(client, name="A1").status_code == 201
    assert create_account(client, name="A2", currency="USD").status_code == 201
    r = client.get("/accounts")
    assert r.status_code == 200
    assert sorted([a["name"] for a in r.json()]) == ["A1", "A2"]

    from fastapi.testclient import TestClient as TC

    with TC(app) as other:
        ro = other.post(
            "/auth/register",
            json={"name": "B", "email": "b@example.com", "password": "Pass1234"},
        )
        assert ro.status_code == 201
        assert other.get("/accounts").json() == []


def test_get_account(client):
    user = register(client)
    created = create_account(client).json()
    r = client.get(f"/accounts/{created['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]
    assert r.json()["balance"] == created["balance"]
    assert user["email"] == "acct@example.com"


def test_update_allowed_fields(client):
    register(client)
    created = create_account(client).json()
    r = client.patch(
        f"/accounts/{created['id']}",
        json={"name": "Renamed", "account_type": "Savings", "is_business": True},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Renamed"
    assert body["account_type"] == "Savings"
    assert body["is_business"] is True
    assert body["currency"] == "NGN"
    assert Decimal(body["balance"]) == Decimal("5000")


def test_currency_cannot_be_changed(client):
    register(client)
    created = create_account(client).json()
    r = client.patch(f"/accounts/{created['id']}", json={"currency": "USD"})
    assert r.status_code == 422
    assert "cannot be changed" in r.json()["detail"]
    assert client.get(f"/accounts/{created['id']}").json()["currency"] == "NGN"


def test_same_currency_patch_ok(client):
    register(client)
    created = create_account(client).json()
    r = client.patch(f"/accounts/{created['id']}", json={"currency": "NGN"})
    assert r.status_code == 200


def test_delete_account(client):
    register(client)
    created = create_account(client).json()
    r = client.delete(f"/accounts/{created['id']}")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    assert client.get(f"/accounts/{created['id']}").status_code == 404
    assert client.get("/accounts").json() == []


def test_invalid_account_data_rejected(client):
    register(client)
    assert create_account(client, name="   ").status_code == 422
    assert create_account(client, currency="JPY").status_code == 422
    assert create_account(client, account_type="Crypto").status_code == 422
    assert create_account(client, opening_balance="-10").status_code == 422


def test_balance_sums_only_same_currency_transactions(client):
    user = register(client)
    ngn_acct = create_account(
        client, name="NGN Wallet", currency="NGN", opening_balance="1000"
    ).json()
    usd_acct = create_account(
        client, name="USD Wallet", currency="USD", opening_balance="100"
    ).json()
    add_txn(user["id"], ngn_acct["id"], "income", "500", "NGN")
    add_txn(user["id"], ngn_acct["id"], "expense", "200", "NGN")
    add_txn(user["id"], ngn_acct["id"], "income", "999", "USD")  # wrong currency: ignored
    add_txn(user["id"], usd_acct["id"], "sale", "50", "USD")
    add_txn(user["id"], usd_acct["id"], "expense", "20", "USD")

    ngn = client.get(f"/accounts/{ngn_acct['id']}").json()
    usd = client.get(f"/accounts/{usd_acct['id']}").json()
    assert Decimal(ngn["balance"]) == Decimal("1300")  # 1000 + 500 - 200
    assert Decimal(usd["balance"]) == Decimal("130")  # 100 + 50 - 20


def test_primary_currency_change_does_not_rewrite_balances(client):
    register(client)
    created = create_account(
        client, name="Naira", currency="NGN", opening_balance="2500"
    ).json()
    assert client.patch("/users/me", json={"primary_currency": "USD"}).status_code == 200
    assert client.get(f"/accounts/{created['id']}").json()["balance"] == "2500.00"


def test_unauthenticated_access_rejected():
    with TestClient(app) as anon:
        assert anon.get("/accounts").status_code == 401
        assert anon.post("/accounts", json={"name": "X", "currency": "NGN"}).status_code == 401
        assert anon.get("/accounts/1").status_code == 401
        assert anon.patch("/accounts/1", json={"name": "Y"}).status_code == 401
        assert anon.delete("/accounts/1").status_code == 401


def test_user_a_cannot_access_user_b_account(client):
    register(client, email="a@example.com")
    created = create_account(client, name="A Private").json()

    from fastapi.testclient import TestClient as TC

    with TC(app) as other:
        assert other.post(
            "/auth/register",
            json={"name": "B", "email": "b@example.com", "password": "Pass1234"},
        ).status_code == 201
        assert other.get(f"/accounts/{created['id']}").status_code == 404
        assert other.patch(
            f"/accounts/{created['id']}", json={"name": "Hijacked"}
        ).status_code == 404
        assert other.delete(f"/accounts/{created['id']}").status_code == 404

    # A's account untouched.
    assert client.get(f"/accounts/{created['id']}").json()["name"] == "A Private"
