"""Phase 6 tests: income/expense transactions CRUD, validation, isolation.

Run against the isolated test database only (mynairatrack_test).
Usage: python -m pytest tests/test_phase6.py -v  (run from backend/)
"""

import os

os.environ["JWT_SECRET"] = "phase6-test-secret-do-not-use-in-prod"
os.environ["JWT_EXPIRE_MINUTES"] = "60"
os.environ["COOKIE_SECURE"] = "false"
os.environ["RESEND_API_KEY"] = ""

from decimal import Decimal

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
    apply_migrations(TEST_DATABASE_URL)
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


def register(client, email="txn@example.com"):
    r = client.post(
        "/auth/register",
        json={"name": "Txn User", "email": email, "password": "Pass1234"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def make_account(client, name="Main", currency="NGN"):
    r = client.post(
        "/accounts",
        json={"name": name, "currency": currency, "account_type": "Bank Account"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def category_id(client, name, type):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM categories WHERE name=%s AND type=%s AND user_id IS NULL",
                (name, type),
            )
            row = cur.fetchone()
    assert row is not None
    return row[0]


def create_txn(client, **overrides):
    payload = {
        "account_id": overrides.pop("account_id", None),
        "type": "expense",
        "amount": "100",
        "category_id": None,
        "date": "2026-02-01",
    }
    payload.update(overrides)
    return client.post("/transactions", json=payload)


def test_create_income(client):
    register(client)
    acct = make_account(client)
    salary = category_id(client, "Salary", "income")
    r = create_txn(
        client,
        account_id=acct["id"],
        type="income",
        amount="300000",
        category_id=salary,
        note="January salary",
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["type"] == "income"
    assert Decimal(body["amount"]) == Decimal("300000")
    assert body["currency"] == "NGN"  # defaulted from account
    assert body["category_name"] == "Salary"
    assert body["account_name"] == "Main"
    assert body["note"] == "January salary"


def test_create_expense_explicit_currency(client):
    register(client)
    acct = make_account(client, currency="USD")
    food = category_id(client, "Food", "expense")
    r = create_txn(
        client,
        account_id=acct["id"],
        type="expense",
        amount="20",
        currency="USD",
        category_id=food,
    )
    assert r.status_code == 201, r.text
    assert r.json()["currency"] == "USD"


def test_transaction_can_use_other_supported_currency(client):
    register(client)
    acct = make_account(client, currency="NGN")
    food = category_id(client, "Food", "expense")
    r = create_txn(
        client, account_id=acct["id"], amount="20", currency="USD", category_id=food
    )
    assert r.status_code == 201, r.text
    assert r.json()["currency"] == "USD"


def test_list_and_filter_transactions(client):
    register(client)
    ngn = make_account(client, name="NGN Wallet", currency="NGN")
    usd = make_account(client, name="USD Wallet", currency="USD")
    food = category_id(client, "Food", "expense")
    salary = category_id(client, "Salary", "income")
    assert create_txn(client, account_id=ngn["id"], amount="30000", category_id=food).status_code == 201
    assert create_txn(
        client, account_id=usd["id"], type="income", amount="500", category_id=salary
    ).status_code == 201

    assert len(client.get("/transactions").json()) == 2
    assert len(client.get("/transactions", params={"type": "income"}).json()) == 1
    assert len(client.get("/transactions", params={"type": "expense"}).json()) == 1
    assert (
        len(client.get("/transactions", params={"currency": "NGN"}).json()) == 1
    )
    assert (
        len(
            client.get("/transactions", params={"account_id": usd["id"]}).json()
        )
        == 1
    )
    assert (
        len(
            client.get(
                "/transactions",
                params={"date_from": "2026-01-01", "date_to": "2026-01-31"},
            ).json()
        )
        == 0
    )


def test_retrieve_transaction(client):
    register(client)
    acct = make_account(client)
    food = category_id(client, "Food", "expense")
    created = create_txn(client, account_id=acct["id"], category_id=food).json()
    r = client.get(f"/transactions/{created['id']}")
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


def test_update_transaction(client):
    register(client)
    acct = make_account(client)
    food = category_id(client, "Food", "expense")
    transport = category_id(client, "Transportation", "expense")
    created = create_txn(client, account_id=acct["id"], category_id=food).json()
    r = client.patch(
        f"/transactions/{created['id']}",
        json={"amount": "250", "category_id": transport, "note": "Taxi"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert Decimal(body["amount"]) == Decimal("250")
    assert body["category_name"] == "Transportation"
    assert body["note"] == "Taxi"
    assert body["currency"] == "NGN"  # untouched when omitted


def test_explicit_currency_edit_allowed(client):
    register(client)
    acct = make_account(client)
    food = category_id(client, "Food", "expense")
    created = create_txn(client, account_id=acct["id"], category_id=food).json()
    r = client.patch(f"/transactions/{created['id']}", json={"currency": "USD"})
    assert r.status_code == 200
    assert r.json()["currency"] == "USD"


def test_delete_transaction(client):
    register(client)
    acct = make_account(client)
    created = create_txn(client, account_id=acct["id"]).json()
    assert client.delete(f"/transactions/{created['id']}").status_code == 200
    assert client.get(f"/transactions/{created['id']}").status_code == 404
    assert client.get("/transactions").json() == []


def test_amount_validation(client):
    register(client)
    acct = make_account(client)
    assert create_txn(client, account_id=acct["id"], amount="0").status_code == 422
    assert create_txn(client, account_id=acct["id"], amount="-5").status_code == 422
    assert create_txn(client, account_id=acct["id"], amount="abc").status_code == 422


def test_currency_and_type_validation(client):
    register(client)
    acct = make_account(client)
    assert create_txn(client, account_id=acct["id"], currency="JPY").status_code == 422
    assert create_txn(client, account_id=acct["id"], type="transfer").status_code == 422
    assert create_txn(client, account_id=acct["id"], type="sale").status_code == 422


def test_category_type_compatibility(client):
    register(client)
    acct = make_account(client)
    salary = category_id(client, "Salary", "income")
    food = category_id(client, "Food", "expense")
    # Expense with an income category rejected.
    assert (
        create_txn(client, account_id=acct["id"], category_id=salary).status_code
        == 422
    )
    # Income with an expense category rejected.
    assert (
        create_txn(
            client, account_id=acct["id"], type="income", amount="50", category_id=food
        ).status_code
        == 422
    )


def test_other_users_account_rejected(client):
    register(client, email="a@example.com")
    acct = make_account(client, name="A Private")

    from fastapi.testclient import TestClient as TC

    with TC(app) as other:
        assert other.post(
            "/auth/register",
            json={"name": "B", "email": "b@example.com", "password": "Pass1234"},
        ).status_code == 201
        r = other.post(
            "/transactions",
            json={"account_id": acct["id"], "type": "expense", "amount": "10"},
        )
        assert r.status_code == 422


def test_unauthenticated_access_rejected():
    with TestClient(app) as anon:
        assert anon.get("/transactions").status_code == 401
        assert anon.post("/transactions", json={}).status_code == 401
        assert anon.get("/transactions/1").status_code == 401
        assert anon.patch("/transactions/1", json={}).status_code == 401
        assert anon.delete("/transactions/1").status_code == 401


def test_user_a_cannot_touch_user_b_transaction(client):
    register(client, email="a@example.com")
    acct = make_account(client)
    created = create_txn(client, account_id=acct["id"]).json()

    from fastapi.testclient import TestClient as TC

    with TC(app) as other:
        assert other.post(
            "/auth/register",
            json={"name": "B", "email": "b@example.com", "password": "Pass1234"},
        ).status_code == 201
        assert other.get(f"/transactions/{created['id']}").status_code == 404
        assert other.patch(
            f"/transactions/{created['id']}", json={"amount": "999"}
        ).status_code == 404
        assert other.delete(f"/transactions/{created['id']}").status_code == 404
        assert other.get("/transactions").json() == []

    assert Decimal(client.get(f"/transactions/{created['id']}").json()["amount"]) == Decimal(
        "100"
    )


def test_multi_currency_data_preserved(client):
    register(client)
    ngn = make_account(client, name="Naira", currency="NGN")
    usd = make_account(client, name="Dollar", currency="USD")
    assert create_txn(client, account_id=ngn["id"], amount="30000").status_code == 201
    assert create_txn(
        client, account_id=usd["id"], type="income", amount="500", currency="USD"
    ).status_code == 201
    rows = {t["currency"]: t for t in client.get("/transactions").json()}
    assert Decimal(rows["NGN"]["amount"]) == Decimal("30000")
    assert Decimal(rows["USD"]["amount"]) == Decimal("500")
    # Changing primary currency rewrites nothing.
    assert client.patch("/users/me", json={"primary_currency": "USD"}).status_code == 200
    rows = {t["currency"]: t for t in client.get("/transactions").json()}
    assert Decimal(rows["NGN"]["amount"]) == Decimal("30000")
    assert Decimal(rows["USD"]["amount"]) == Decimal("500")


def test_transaction_affects_account_balance(client):
    register(client)
    acct = make_account(client)
    food = category_id(client, "Food", "expense")
    assert create_txn(client, account_id=acct["id"], amount="30000", category_id=food).status_code == 201
    balance = client.get(f"/accounts/{acct['id']}").json()["balance"]
    assert Decimal(balance) == Decimal("-30000")


def test_account_with_transactions_cannot_be_deleted(client):
    register(client)
    acct = make_account(client)
    assert create_txn(client, account_id=acct["id"]).status_code == 201
    r = client.delete(f"/accounts/{acct['id']}")
    assert r.status_code == 409
    assert "transactions" in r.json()["detail"].lower()
    # Account and transaction both survive.
    assert client.get(f"/accounts/{acct['id']}").status_code == 200
    assert len(client.get("/transactions").json()) == 1


def test_categories_list_returns_defaults(client):
    register(client)
    r = client.get("/categories")
    assert r.status_code == 200, r.text
    rows = r.json()
    expense = [c for c in rows if c["type"] == "expense"]
    income = [c for c in rows if c["type"] == "income"]
    assert len(expense) == 21
    assert len(income) == 13
    assert {c["name"] for c in income} >= {"Salary", "Freelance"}
    assert {c["name"] for c in expense if c["is_business"]} >= {
        "Cost of Goods Sold", "Staff Salaries", "Shop Rent"}


def test_categories_require_auth():
    with TestClient(app) as anon:
        assert anon.get("/categories").status_code == 401
