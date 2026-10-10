"""Phase 9 tests: savings targets and financial goals.

Run against the isolated test database only (mynairatrack_test).
Usage: python -m pytest tests/test_phase9.py -v  (run from backend/)
"""

import os

os.environ["JWT_SECRET"] = "phase9-test-secret-do-not-use-in-prod"
os.environ["JWT_EXPIRE_MINUTES"] = "60"
os.environ["COOKIE_SECURE"] = "false"
os.environ["RESEND_API_KEY"] = ""

from datetime import date, timedelta
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


def register(client, email="goal@example.com"):
    r = client.post(
        "/auth/register",
        json={"name": "Goal User", "email": email, "password": "Pass1234"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_anonymous_rejected():
    with TestClient(app) as anon:
        for method, path in [
            ("GET", "/savings-targets"), ("POST", "/savings-targets"),
            ("GET", "/savings-targets/1"), ("PATCH", "/savings-targets/1"),
            ("DELETE", "/savings-targets/1"),
            ("GET", "/goals"), ("POST", "/goals"),
            ("GET", "/goals/1"), ("PATCH", "/goals/1"), ("DELETE", "/goals/1"),
        ]:
            r = anon.request(method, path, json={})
            assert r.status_code == 401, (method, path)


def test_create_savings_target(client):
    register(client)
    r = client.post("/savings-targets", json={
        "name": "Emergency Fund", "target_amount": "500000", "currency": "NGN"})
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["current_amount"] == "0.00" or Decimal(body["current_amount"]) == 0
    assert body["remaining"] == "500000.00" or Decimal(body["remaining"]) == Decimal("500000")
    assert body["percent_complete"] == 0
    assert body["status"] == "In Progress"


def test_create_goal_with_deadline(client):
    register(client)
    future = (date.today() + timedelta(days=90)).isoformat()
    r = client.post("/goals", json={
        "name": "Car", "target_amount": "2000000", "currency": "NGN",
        "deadline": future})
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "In Progress"
    assert r.json()["deadline"] == future


def test_create_usd_goal_without_usd_account(client):
    register(client)
    r = client.post("/goals", json={
        "name": "Dollar reserve", "target_amount": "5000", "currency": "USD"})
    assert r.status_code == 201, r.text
    assert r.json()["currency"] == "USD"


def test_create_validation(client):
    register(client)
    assert client.post("/savings-targets",
                       json={"name": "   ", "target_amount": "10", "currency": "NGN"}).status_code == 422
    assert client.post("/savings-targets",
                       json={"name": "X", "target_amount": "0", "currency": "NGN"}).status_code == 422
    assert client.post("/savings-targets",
                       json={"name": "X", "target_amount": "-5", "currency": "NGN"}).status_code == 422
    assert client.post("/savings-targets",
                       json={"name": "X", "target_amount": "10", "currency": "JPY"}).status_code == 422
    assert client.post("/savings-targets",
                       json={"name": "X", "target_amount": "10", "currency": "NGN",
                             "current_amount": "-1"}).status_code == 422
    assert client.post("/goals",
                       json={"name": "X", "target_amount": "10", "currency": "NGN",
                             "suggested_contribution": "-1"}).status_code == 422


def test_progress_math_and_completion(client):
    register(client)
    created = client.post("/savings-targets", json={
        "name": "Laptop", "target_amount": "500000", "currency": "NGN"}).json()
    r = client.patch(f"/savings-targets/{created['id']}", json={"current_amount": "300000"})
    assert r.status_code == 200
    body = r.json()
    assert Decimal(body["remaining"]) == Decimal("200000")
    assert body["percent_complete"] == pytest.approx(60.0)
    assert body["status"] == "In Progress"
    r = client.patch(f"/savings-targets/{created['id']}", json={"current_amount": "500000"})
    assert r.json()["status"] == "Completed"
    assert Decimal(r.json()["remaining"]) == 0


def test_over_progress_preserved_and_capped(client):
    register(client)
    created = client.post("/savings-targets", json={
        "name": "Laptop", "target_amount": "500000", "currency": "NGN"}).json()
    r = client.patch(f"/savings-targets/{created['id']}", json={"current_amount": "600000"})
    body = r.json()
    assert Decimal(body["current_amount"]) == Decimal("600000")
    assert body["percent_complete"] == 100
    assert Decimal(body["remaining"]) == 0
    assert Decimal(body["exceeded_by"]) == Decimal("100000")
    assert body["status"] == "Completed"


def test_negative_progress_rejected(client):
    register(client)
    created = client.post("/savings-targets", json={
        "name": "Laptop", "target_amount": "500000", "currency": "NGN"}).json()
    assert client.patch(f"/savings-targets/{created['id']}",
                        json={"current_amount": "-10"}).status_code == 422


def test_goal_deadline_statuses(client):
    register(client)
    past = (date.today() - timedelta(days=5)).isoformat()
    future = (date.today() + timedelta(days=30)).isoformat()
    overdue = client.post("/goals", json={
        "name": "Old", "target_amount": "1000", "currency": "NGN", "deadline": past}).json()
    assert overdue["status"] == "Overdue"
    upcoming = client.post("/goals", json={
        "name": "New", "target_amount": "1000", "currency": "NGN", "deadline": future}).json()
    assert upcoming["status"] == "In Progress"
    done = client.patch(f"/goals/{overdue['id']}", json={"current_amount": "1000"}).json()
    assert done["status"] == "Completed"


def test_currency_change_blocked_with_progress(client):
    register(client)
    created = client.post("/savings-targets", json={
        "name": "Fund", "target_amount": "1000", "currency": "NGN",
        "current_amount": "100"}).json()
    r = client.patch(f"/savings-targets/{created['id']}", json={"currency": "USD"})
    assert r.status_code == 422
    assert client.get(f"/savings-targets/{created['id']}").json()["currency"] == "NGN"


def test_currency_change_allowed_without_progress(client):
    register(client)
    created = client.post("/goals", json={
        "name": "Fund", "target_amount": "1000", "currency": "NGN"}).json()
    r = client.patch(f"/goals/{created['id']}", json={"currency": "USD"})
    assert r.status_code == 200
    assert r.json()["currency"] == "USD"


def test_ownership_isolation(client):
    register(client, email="a@example.com")
    s = client.post("/savings-targets", json={
        "name": "A Fund", "target_amount": "100", "currency": "NGN"}).json()
    g = client.post("/goals", json={
        "name": "A Goal", "target_amount": "100", "currency": "NGN"}).json()

    from fastapi.testclient import TestClient as TC

    with TC(app) as other:
        assert other.post(
            "/auth/register",
            json={"name": "B", "email": "b@example.com", "password": "Pass1234"},
        ).status_code == 201
        assert other.get(f"/savings-targets/{s['id']}").status_code == 404
        assert other.patch(f"/savings-targets/{s['id']}", json={"name": "X"}).status_code == 404
        assert other.delete(f"/savings-targets/{s['id']}").status_code == 404
        assert other.get(f"/goals/{g['id']}").status_code == 404
        assert other.delete(f"/goals/{g['id']}").status_code == 404
        assert other.get("/savings-targets").json() == []
        assert other.get("/goals").json() == []


def test_delete_keeps_everything_else(client):
    register(client)
    acct = client.post("/accounts", json={"name": "Main", "currency": "NGN"}).json()
    food = None
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM categories WHERE name='Food' AND type='expense' AND user_id IS NULL")
            food = cur.fetchone()[0]
    assert client.post("/transactions", json={
        "account_id": acct["id"], "type": "expense", "amount": "50",
        "category_id": food}).status_code == 201
    budget = client.post("/budgets", json={
        "name": "B", "amount": "1000", "currency": "NGN",
        "period_start": "2026-01-01", "period_end": "2026-12-31",
        "allocations": [{"category_id": food, "allocated_amount": "500"}]}).json()
    s = client.post("/savings-targets", json={
        "name": "Fund", "target_amount": "100", "currency": "NGN"}).json()
    g = client.post("/goals", json={
        "name": "Goal", "target_amount": "100", "currency": "NGN"}).json()
    assert client.delete(f"/savings-targets/{s['id']}").status_code == 200
    assert client.delete(f"/goals/{g['id']}").status_code == 200
    assert len(client.get("/transactions").json()) == 1
    assert len(client.get("/accounts").json()) == 1
    assert client.get(f"/budgets/{budget['id']}").status_code == 200


def test_primary_change_rewrites_nothing(client):
    register(client)
    created = client.post("/goals", json={
        "name": "Dollar", "target_amount": "5000", "currency": "USD",
        "current_amount": "1000"}).json()
    assert client.patch("/users/me", json={"primary_currency": "USD"}).status_code == 200
    body = client.get(f"/goals/{created['id']}").json()
    assert body["currency"] == "USD"
    assert Decimal(body["target_amount"]) == Decimal("5000")
    assert Decimal(body["current_amount"]) == Decimal("1000")
