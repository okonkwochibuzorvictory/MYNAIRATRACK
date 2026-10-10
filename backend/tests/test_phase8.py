"""Phase 8 tests: budgets CRUD, allocations, monitoring, currency rules.

Run against the isolated test database only (mynairatrack_test).
Usage: python -m pytest tests/test_phase8.py -v  (run from backend/)
"""

import os

os.environ["JWT_SECRET"] = "phase8-test-secret-do-not-use-in-prod"
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


def register(client, email="bud@example.com"):
    r = client.post(
        "/auth/register",
        json={"name": "Bud User", "email": email, "password": "Pass1234"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def make_account(client, name="Main", currency="NGN"):
    r = client.post("/accounts", json={"name": name, "currency": currency})
    assert r.status_code == 201, r.text
    return r.json()


def cat_id(name, type):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM categories WHERE name=%s AND type=%s AND user_id IS NULL",
                (name, type),
            )
            row = cur.fetchone()
    assert row is not None
    return row[0]


def add_expense(client, acct_id, amount, category, currency="NGN", day="2026-10-05"):
    return client.post(
        "/transactions",
        json={"account_id": acct_id, "type": "expense", "amount": amount,
              "currency": currency, "category_id": category, "date": day},
    )


def make_budget(client, **overrides):
    payload = {
        "name": "October Personal Budget",
        "amount": "200000",
        "currency": "NGN",
        "period_start": "2026-10-01",
        "period_end": "2026-10-31",
        "allocations": [],
    }
    payload.update(overrides)
    return client.post("/budgets", json=payload)


def test_anonymous_rejected():
    with TestClient(app) as anon:
        assert anon.get("/budgets").status_code == 401
        assert anon.post("/budgets", json={}).status_code == 401
        assert anon.get("/budgets/1").status_code == 401
        assert anon.patch("/budgets/1", json={}).status_code == 401
        assert anon.delete("/budgets/1").status_code == 401


def test_create_valid_budget(client):
    register(client)
    food = cat_id("Food", "expense")
    r = make_budget(
        client,
        allocations=[{"category_id": food, "allocated_amount": "50000"}],
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "October Personal Budget"
    assert body["total_allocated"] == "50000.00"
    assert body["total_spent"] == "0"
    assert body["status"] == "On Track"


def test_create_validation(client):
    register(client)
    food = cat_id("Food", "expense")
    salary = cat_id("Salary", "income")
    assert make_budget(client, amount="0").status_code == 422
    assert make_budget(client, amount="-5").status_code == 422
    assert make_budget(client, currency="JPY").status_code == 422
    assert make_budget(client, name="   ").status_code == 422
    assert make_budget(
        client, period_start="2026-10-31", period_end="2026-10-01"
    ).status_code == 422
    # Over-allocation rejected.
    assert make_budget(
        client, amount="10000",
        allocations=[{"category_id": food, "allocated_amount": "20000"}],
    ).status_code == 422
    # Duplicate category rejected.
    assert make_budget(
        client, allocations=[
            {"category_id": food, "allocated_amount": "1000"},
            {"category_id": food, "allocated_amount": "1000"}],
    ).status_code == 422
    # Income category rejected.
    assert make_budget(
        client, allocations=[{"category_id": salary, "allocated_amount": "1000"}],
    ).status_code == 422
    # Zero allocation rejected.
    assert make_budget(
        client, allocations=[{"category_id": food, "allocated_amount": "0"}],
    ).status_code == 422


def test_ownership_isolation(client):
    register(client, email="a@example.com")
    created = make_budget(client).json()

    from fastapi.testclient import TestClient as TC

    with TC(app) as other:
        assert other.post(
            "/auth/register",
            json={"name": "B", "email": "b@example.com", "password": "Pass1234"},
        ).status_code == 201
        assert other.get(f"/budgets/{created['id']}").status_code == 404
        assert other.patch(f"/budgets/{created['id']}", json={"name": "X"}).status_code == 404
        assert other.delete(f"/budgets/{created['id']}").status_code == 404
        assert other.get("/budgets").json() == []

    assert client.get(f"/budgets/{created['id']}").status_code == 200


def test_monitoring_same_currency_only(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    transport = cat_id("Transportation", "expense")
    budget = make_budget(
        client,
        allocations=[
            {"category_id": food, "allocated_amount": "50000"},
            {"category_id": transport, "allocated_amount": "30000"},
        ],
    ).json()
    # Matching: NGN food expense in period.
    assert add_expense(client, acct["id"], "40000", food).status_code == 201
    # Ignored: USD expense (different currency).
    assert add_expense(client, acct["id"], "100", food, currency="USD").status_code == 201
    # Ignored: outside period.
    assert add_expense(client, acct["id"], "9000", food, day="2026-09-15").status_code == 201
    # Ignored: income.
    assert client.post(
        "/transactions",
        json={"account_id": acct["id"], "type": "income", "amount": "5000",
              "category_id": cat_id("Salary", "income")},
    ).status_code == 201

    body = client.get(f"/budgets/{budget['id']}").json()
    assert Decimal(body["total_spent"]) == Decimal("40000")
    assert Decimal(body["remaining"]) == Decimal("160000")
    assert body["percent_used"] == pytest.approx(20.0)
    assert body["status"] == "On Track"
    food_row = next(a for a in body["allocations"] if a["category_name"] == "Food")
    assert Decimal(food_row["spent"]) == Decimal("40000")
    assert food_row["percent_used"] == pytest.approx(80.0)
    assert food_row["status"] == "Near Limit"
    transport_row = next(a for a in body["allocations"] if a["category_name"] == "Transportation")
    assert transport_row["status"] == "On Track"


def test_status_thresholds_and_over_budget(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    budget = make_budget(
        client, amount="10000",
        allocations=[{"category_id": food, "allocated_amount": "10000"}],
    ).json()
    assert add_expense(client, acct["id"], "9900", food).status_code == 201
    body = client.get(f"/budgets/{budget['id']}").json()
    assert body["status"] == "Near Limit"
    assert add_expense(client, acct["id"], "200", food).status_code == 201
    body = client.get(f"/budgets/{budget['id']}").json()
    assert body["status"] == "Over Budget"
    assert Decimal(body["remaining"]) == Decimal("-100")


def test_unallocated_spending(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    transport = cat_id("Transportation", "expense")
    budget = make_budget(
        client, allocations=[{"category_id": food, "allocated_amount": "50000"}]
    ).json()
    assert add_expense(client, acct["id"], "10000", food).status_code == 201
    assert add_expense(client, acct["id"], "7000", transport).status_code == 201
    body = client.get(f"/budgets/{budget['id']}").json()
    assert Decimal(body["total_spent"]) == Decimal("17000")
    assert Decimal(body["unallocated_spending"]) == Decimal("7000")
    assert len(body["allocations"]) == 1  # nothing auto-created


def test_transaction_edits_recalculate(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    transport = cat_id("Transportation", "expense")
    budget = make_budget(
        client, allocations=[{"category_id": food, "allocated_amount": "50000"}]
    ).json()
    txn = add_expense(client, acct["id"], "10000", food).json()
    assert Decimal(client.get(f"/budgets/{budget['id']}").json()["total_spent"]) == Decimal("10000")
    # Edit amount.
    assert client.patch(f"/transactions/{txn['id']}", json={"amount": "12000"}).status_code == 200
    assert Decimal(client.get(f"/budgets/{budget['id']}").json()["total_spent"]) == Decimal("12000")
    # Change category to unallocated.
    assert client.patch(f"/transactions/{txn['id']}", json={"category_id": transport}).status_code == 200
    body = client.get(f"/budgets/{budget['id']}").json()
    assert Decimal(body["unallocated_spending"]) == Decimal("12000")
    # Move date out of period.
    assert client.patch(f"/transactions/{txn['id']}", json={"date": "2026-09-01"}).status_code == 200
    assert Decimal(client.get(f"/budgets/{budget['id']}").json()["total_spent"]) == Decimal("0")
    # Delete removes spending.
    other = add_expense(client, acct["id"], "5000", food).json()
    assert Decimal(client.get(f"/budgets/{budget['id']}").json()["total_spent"]) == Decimal("5000")
    assert client.delete(f"/transactions/{other['id']}").status_code == 200
    assert Decimal(client.get(f"/budgets/{budget['id']}").json()["total_spent"]) == Decimal("0")


def test_currency_change_blocked_with_spending(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    budget = make_budget(client).json()
    assert add_expense(client, acct["id"], "1000", food).status_code == 201
    r = client.patch(f"/budgets/{budget['id']}", json={"currency": "USD"})
    assert r.status_code == 422
    assert client.get(f"/budgets/{budget['id']}").json()["currency"] == "NGN"
    # History untouched.
    rows = client.get("/transactions").json()
    assert rows[0]["currency"] == "NGN"


def test_currency_change_allowed_without_spending(client):
    register(client)
    budget = make_budget(client).json()
    r = client.patch(f"/budgets/{budget['id']}", json={"currency": "USD"})
    assert r.status_code == 200
    assert r.json()["currency"] == "USD"


def test_edit_budget_fields(client):
    register(client)
    food = cat_id("Food", "expense")
    budget = make_budget(
        client, allocations=[{"category_id": food, "allocated_amount": "50000"}]
    ).json()
    r = client.patch(
        f"/budgets/{budget['id']}",
        json={"name": "November", "amount": "250000",
              "period_start": "2026-11-01", "period_end": "2026-11-30"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "November"
    assert body["amount"] == "250000.00" or Decimal(body["amount"]) == Decimal("250000")
    # Amount below allocated total rejected.
    assert client.patch(f"/budgets/{budget['id']}", json={"amount": "1000"}).status_code == 422


def test_allocation_endpoints(client):
    register(client)
    food = cat_id("Food", "expense")
    transport = cat_id("Transportation", "expense")
    budget = make_budget(client, amount="100000").json()
    r = client.post(f"/budgets/{budget['id']}/allocations",
                    json={"category_id": food, "allocated_amount": "50000"})
    assert r.status_code == 201, r.text
    alloc_id = r.json()["id"]
    # Duplicate rejected.
    assert client.post(f"/budgets/{budget['id']}/allocations",
                       json={"category_id": food, "allocated_amount": "1000"}).status_code == 422
    # Over-budget rejected.
    assert client.post(f"/budgets/{budget['id']}/allocations",
                       json={"category_id": transport, "allocated_amount": "60000"}).status_code == 422
    # Update allocation.
    r = client.patch(f"/budgets/{budget['id']}/allocations/{alloc_id}",
                     json={"category_id": transport, "allocated_amount": "30000"})
    assert r.status_code == 200
    assert len(r.json()["allocations"]) == 1
    # Delete allocation.
    assert client.delete(f"/budgets/{budget['id']}/allocations/{alloc_id}").status_code == 200
    assert client.get(f"/budgets/{budget['id']}").json()["allocations"] == []


def test_delete_budget_keeps_everything_else(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    budget = make_budget(
        client, allocations=[{"category_id": food, "allocated_amount": "50000"}]
    ).json()
    assert add_expense(client, acct["id"], "1000", food).status_code == 201
    assert client.delete(f"/budgets/{budget['id']}").status_code == 200
    assert client.get(f"/budgets/{budget['id']}").status_code == 404
    assert len(client.get("/transactions").json()) == 1
    assert len(client.get("/accounts").json()) == 1
    assert any(c["name"] == "Food" for c in client.get("/categories").json())


def test_other_users_expenses_not_counted(client):
    register(client, email="a@example.com")
    acct_a = make_account(client, name="A Main")
    food = cat_id("Food", "expense")
    budget = make_budget(client).json()
    assert add_expense(client, acct_a["id"], "1000", food).status_code == 201

    from fastapi.testclient import TestClient as TC

    with TC(app) as other:
        assert other.post(
            "/auth/register",
            json={"name": "B", "email": "b@example.com", "password": "Pass1234"},
        ).status_code == 201
        acct_b = other.post("/accounts", json={"name": "B Main", "currency": "NGN"}).json()
        assert other.post(
            "/transactions",
            json={"account_id": acct_b["id"], "type": "expense", "amount": "99999",
                  "category_id": food},
        ).status_code == 201

    assert Decimal(client.get(f"/budgets/{budget['id']}").json()["total_spent"]) == Decimal("1000")
