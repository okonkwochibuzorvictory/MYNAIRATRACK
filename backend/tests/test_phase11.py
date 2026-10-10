"""Phase 11 tests: Business Mode activation, separation, sales, profit.

Run against the isolated test database only (mynairatrack_test).
Usage: python -m pytest tests/test_phase11.py -v  (run from backend/)
"""

import os

os.environ["JWT_SECRET"] = "phase11-test-secret-do-not-use-in-prod"
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
    applied = apply_migrations(TEST_DATABASE_URL)
    assert "004_business_mode" in applied
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


def register(client, email="biz@example.com"):
    r = client.post(
        "/auth/register",
        json={"name": "Biz User", "email": email, "password": "Pass1234"},
    )
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


def test_activation_defaults_off_and_toggles(client):
    register(client)
    assert client.get("/business/status").json() == {"active": False}
    assert client.post("/business/activate").json() == {"active": True}
    assert client.get("/business/status").json() == {"active": True}
    assert client.post("/business/deactivate").json() == {"active": False}
    assert client.get("/business/status").json() == {"active": False}


def test_activation_requires_auth():
    with TestClient(app) as anon:
        assert anon.get("/business/status").status_code == 401
        assert anon.post("/business/activate").status_code == 401
        assert anon.get("/business/summary").status_code == 401


def test_business_endpoints_gated_when_off(client):
    register(client)
    assert client.get("/business/summary").status_code == 403
    assert client.get("/business/transactions").status_code == 403
    assert client.get("/business/budgets").status_code == 403
    assert client.get("/transactions", params={"business": True}).status_code == 403
    assert client.get("/accounts", params={"business": True}).status_code == 403
    assert client.get("/budgets", params={"business": True}).status_code == 403


def test_personal_views_exclude_business_records(client):
    register(client)
    biz = client.post(
        "/accounts",
        json={"name": "Shop", "currency": "NGN", "is_business": True},
    ).json()
    food = cat_id("Food", "expense")
    assert client.post("/transactions", json={
        "account_id": biz["id"], "type": "expense", "amount": "100",
        "category_id": food}).status_code == 201
    assert client.get("/transactions").json() == []
    assert client.get("/accounts").json() == []
    assert client.get("/budgets").json() == []
    rows = client.get("/insights/summary", params={
        "currency": "NGN", "period_start": "2026-01-01",
        "period_end": "2026-12-31"}).json()["by_category"]
    assert rows == []


def test_sale_only_on_business_accounts(client):
    register(client)
    personal = client.post("/accounts", json={"name": "Main", "currency": "NGN"}).json()
    salary = cat_id("Salary", "income")
    # Sale on personal account rejected.
    assert client.post("/transactions", json={
        "account_id": personal["id"], "type": "sale", "amount": "50",
        "category_id": salary}).status_code == 422
    # Sale with expense category rejected.
    biz = client.post(
        "/accounts",
        json={"name": "Shop", "currency": "USD", "is_business": True},
    ).json()
    food = cat_id("Food", "expense")
    assert client.post("/transactions", json={
        "account_id": biz["id"], "type": "sale", "amount": "50",
        "category_id": food}).status_code == 422
    # Sale with income category on business account accepted.
    r = client.post("/transactions", json={
        "account_id": biz["id"], "type": "sale", "amount": "500",
        "category_id": salary})
    assert r.status_code == 201, r.text
    assert r.json()["currency"] == "USD"


def test_per_currency_profit(client):
    register(client)
    client.post("/business/activate")
    usd = client.post(
        "/accounts",
        json={"name": "Shop USD", "currency": "USD", "is_business": True},
    ).json()
    ngn = client.post(
        "/accounts",
        json={"name": "Shop NGN", "currency": "NGN", "is_business": True},
    ).json()
    salary = cat_id("Salary", "income")
    food = cat_id("Food", "expense")
    assert client.post("/transactions", json={
        "account_id": usd["id"], "type": "sale", "amount": "500",
        "category_id": salary}).status_code == 201
    assert client.post("/transactions", json={
        "account_id": usd["id"], "type": "expense", "amount": "20",
        "category_id": food}).status_code == 201
    assert client.post("/transactions", json={
        "account_id": ngn["id"], "type": "income", "amount": "300000",
        "category_id": salary}).status_code == 201
    assert client.post("/transactions", json={
        "account_id": ngn["id"], "type": "expense", "amount": "30000",
        "category_id": food}).status_code == 201
    r = client.get("/business/summary")
    assert r.status_code == 200, r.text
    per = {row["currency"]: row for row in r.json()["per_currency"]}
    assert Decimal(per["USD"]["sales"]) == Decimal("500")
    assert Decimal(per["USD"]["profit"]) == Decimal("480")
    assert Decimal(per["NGN"]["income"]) == Decimal("300000")
    assert Decimal(per["NGN"]["profit"]) == Decimal("270000")
    by_acct = {row["account_name"]: row for row in r.json()["accounts"]}
    assert set(by_acct) == {"Shop USD", "Shop NGN"}
    assert Decimal(by_acct["Shop USD"]["profit"]) == Decimal("480")
    assert Decimal(by_acct["Shop NGN"]["profit"]) == Decimal("270000")


def test_business_history_requires_activation_and_isolation(client):
    register(client, email="a@example.com")
    client.post("/business/activate")
    biz = client.post(
        "/accounts",
        json={"name": "Shop", "currency": "NGN", "is_business": True},
    ).json()
    food = cat_id("Food", "expense")
    assert client.post("/transactions", json={
        "account_id": biz["id"], "type": "expense", "amount": "10",
        "category_id": food}).status_code == 201
    assert len(client.get("/business/transactions").json()) == 1

    from fastapi.testclient import TestClient as TC

    with TC(app) as other:
        assert other.post(
            "/auth/register",
            json={"name": "B", "email": "b@example.com", "password": "Pass1234"},
        ).status_code == 201
        assert other.get("/business/summary").status_code == 403
        assert other.get("/business/transactions").status_code == 403
        other.post("/business/activate")
        assert other.get("/business/summary").json() == {"per_currency": [], "accounts": []}
        assert other.get("/business/transactions").json() == []


def test_business_budgets_separate_and_monitored(client):
    register(client)
    client.post("/business/activate")
    biz = client.post(
        "/accounts",
        json={"name": "Shop", "currency": "NGN", "is_business": True},
    ).json()
    food = cat_id("Food", "expense")
    r = client.post("/budgets", json={
        "name": "Shop Budget", "amount": "50000", "currency": "NGN",
        "period_start": "2026-10-01", "period_end": "2026-10-31",
        "is_business": True,
        "allocations": [{"category_id": food, "allocated_amount": "50000"}]})
    assert r.status_code == 201, r.text
    assert r.json()["is_business"] is True
    # Personal list excludes it; business list includes it.
    assert client.get("/budgets").json() == []
    assert len(client.get("/budgets", params={"business": True}).json()) == 1
    assert len(client.get("/business/budgets").json()) == 1
    # Business expense counts toward the business budget only.
    assert client.post("/transactions", json={
        "account_id": biz["id"], "type": "expense", "amount": "10000",
        "category_id": food, "date": "2026-10-05"}).status_code == 201
    personal = client.post("/accounts", json={"name": "Main", "currency": "NGN"}).json()
    assert client.post("/transactions", json={
        "account_id": personal["id"], "type": "expense", "amount": "10000",
        "category_id": food, "date": "2026-10-05"}).status_code == 201
    body = client.get("/business/budgets").json()[0]
    assert Decimal(body["total_spent"]) == Decimal("10000")


def test_deactivate_preserves_and_hides(client):
    register(client)
    client.post("/business/activate")
    biz = client.post(
        "/accounts",
        json={"name": "Shop", "currency": "NGN", "is_business": True},
    ).json()
    assert client.post("/business/deactivate").json() == {"active": False}
    assert client.get("/business/summary").status_code == 403
    assert client.get(f"/accounts/{biz['id']}").status_code == 403
    assert client.get("/accounts").json() == []
    # Reactivate restores access.
    client.post("/business/activate")
    assert client.get(f"/accounts/{biz['id']}").status_code == 200
    # Nothing converted.
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT is_business FROM accounts WHERE id=%s", (biz["id"],))
            assert cur.fetchone()[0] is True


def test_business_alerts_fire(client):
    register(client)
    client.post("/business/activate")
    biz = client.post(
        "/accounts",
        json={"name": "Shop", "currency": "NGN", "is_business": True},
    ).json()
    food = cat_id("Food", "expense")
    client.post("/budgets", json={
        "name": "Shop Budget", "amount": "1000", "currency": "NGN",
        "period_start": "2026-10-01", "period_end": "2026-10-31",
        "is_business": True,
        "allocations": [{"category_id": food, "allocated_amount": "1000"}]})
    assert client.post("/transactions", json={
        "account_id": biz["id"], "type": "expense", "amount": "850",
        "category_id": food, "date": "2026-10-05"}).status_code == 201
    types = [a["type"] for a in client.get("/alerts").json()]
    assert "threshold_80" in types


def test_personal_funding_override_no_double_count(client):
    register(client)
    client.post("/business/activate")
    personal = client.post(
        "/accounts", json={"name": "Cash", "currency": "NGN"},
    ).json()
    food = cat_id("Food", "expense")
    # Business expense funded from a personal account.
    r = client.post("/transactions", json={
        "account_id": personal["id"], "type": "expense", "amount": "5000",
        "category_id": food, "is_business": True})
    assert r.status_code == 201, r.text
    # Account stays personal and its balance reflects the money moved.
    acct = client.get(f"/accounts/{personal['id']}").json()
    assert Decimal(acct["balance"]) == Decimal("-5000")
    # Personal spending reports exclude it; business profit includes it.
    assert client.get("/transactions").json() == []
    summ = client.get("/business/summary").json()["per_currency"]
    assert Decimal(summ[0]["expenses"]) == Decimal("5000")
    assert Decimal(summ[0]["profit"]) == Decimal("-5000")
    # Sale cannot be marked personal.
    salary = cat_id("Salary", "income")
    biz = client.post(
        "/accounts",
        json={"name": "Shop", "currency": "NGN", "is_business": True},
    ).json()
    assert client.post("/transactions", json={
        "account_id": biz["id"], "type": "sale", "amount": "10",
        "category_id": salary, "is_business": False}).status_code == 422


def test_business_categories_scoped(client):
    register(client)
    rows = client.get("/categories").json()
    biz_income = sorted(
        c["name"] for c in rows if c["type"] == "income" and c["is_business"])
    biz_expense = sorted(
        c["name"] for c in rows if c["type"] == "expense" and c["is_business"])
    assert biz_income == [
        "Business Loan Received",
        "Business Other Income",
        "Commission Received",
        "Rental Income",
        "Sales of Goods",
        "Service Income",
        "Sponsorship & Grants",
    ]
    assert "Cost of Goods Sold" in biz_expense
    assert "Staff Salaries" in biz_expense
    # Personal defaults remain non-business.
    food = next(c for c in rows if c["name"] == "Food")
    assert food["is_business"] is False
    # Custom business category + usable in a business sale.
    r = client.post("/categories", json={
        "name": "Wholesale", "type": "income", "is_business": True})
    assert r.status_code == 201, r.text
    assert r.json()["is_business"] is True
    client.post("/business/activate")
    shop = client.post(
        "/accounts",
        json={"name": "Shop", "currency": "NGN", "is_business": True},
    ).json()
    r = client.post("/transactions", json={
        "account_id": shop["id"], "type": "sale", "amount": "250",
        "category_id": r.json()["id"]})
    assert r.status_code == 201, r.text
    assert r.json()["category_name"] == "Wholesale"
