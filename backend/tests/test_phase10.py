"""Phase 10 tests: insights, alert preferences, threshold alerts.

Run against the isolated test database only (mynairatrack_test).
Usage: python -m pytest tests/test_phase10.py -v  (run from backend/)
"""

import os

os.environ["JWT_SECRET"] = "phase10-test-secret-do-not-use-in-prod"
os.environ["JWT_EXPIRE_MINUTES"] = "60"
os.environ["COOKIE_SECURE"] = "false"

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
    assert "003_alert_preferences" in applied
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


def register(client, email="ins@example.com"):
    r = client.post(
        "/auth/register",
        json={"name": "Insights User", "email": email, "password": "Pass1234"},
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
        "name": "October",
        "amount": "1000",
        "currency": "NGN",
        "period_start": "2026-10-01",
        "period_end": "2026-10-31",
        "allocations": [],
    }
    payload.update(overrides)
    r = client.post("/budgets", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_migration_003_applied(client):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT version FROM schema_migrations ORDER BY version")
            versions = [r[0] for r in cur.fetchall()]
    assert "003_alert_preferences" in versions


def test_anonymous_rejected():
    with TestClient(app) as anon:
        assert anon.get("/insights/summary").status_code in (401, 422)
        assert anon.get("/alerts").status_code == 401
        assert anon.get("/alert-preferences").status_code == 401
        assert anon.patch("/alert-preferences", json={}).status_code == 401


def test_preferences_defaults_and_update(client):
    register(client)
    prefs = client.get("/alert-preferences").json()
    assert prefs["master"]["alert_50"] is False
    assert prefs["master"]["alert_80"] is True
    assert prefs["master"]["alert_100"] is True
    assert prefs["master"]["alert_over"] is True
    assert prefs["master"]["alerts_enabled"] is True
    r = client.patch("/alert-preferences", json={"alert_50": True})
    assert r.status_code == 200
    assert r.json()["master"]["alert_50"] is True


def test_master_switch_silences_all(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    make_budget(client)
    assert add_expense(client, acct["id"], "900", food).status_code == 201
    assert len(client.get("/alerts").json()) > 0
    assert client.patch("/alert-preferences", json={"alerts_enabled": False}).status_code == 200
    n_before = len(client.get("/alerts").json())
    assert add_expense(client, acct["id"], "50", food).status_code == 201
    assert len(client.get("/alerts").json()) == n_before


def test_threshold_firing_and_dedup(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    budget = make_budget(client)
    assert add_expense(client, acct["id"], "800", food).status_code == 201
    types = sorted(a["type"] for a in client.get("/alerts").json())
    assert "threshold_80" in types
    assert "threshold_50" not in types  # disabled by default
    # Same threshold, same period: no repeat even after more spending.
    assert add_expense(client, acct["id"], "50", food).status_code == 201
    types = sorted(a["type"] for a in client.get("/alerts").json())
    assert types.count("threshold_80") == 1
    # 100 fires when reached.
    assert add_expense(client, acct["id"], "200", food).status_code == 201
    types = sorted(a["type"] for a in client.get("/alerts").json())
    assert "threshold_100" in types


def test_over_budget_alert(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    make_budget(client, amount="1000")
    assert add_expense(client, acct["id"], "1200", food).status_code == 201
    types = sorted(a["type"] for a in client.get("/alerts").json())
    assert "threshold_100" in types
    assert "threshold_over" in types


def test_reenable_threshold_fires_once(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    budget = make_budget(client)
    assert add_expense(client, acct["id"], "600", food).status_code == 201
    # Enable 50% now: already-reached threshold fires once.
    r = client.put(f"/alert-preferences/budgets/{budget['id']}", json={"alert_50": True})
    assert r.status_code == 200
    types = [a["type"] for a in client.get("/alerts").json()]
    assert types.count("threshold_50") == 1
    # Further spending does not duplicate it.
    assert add_expense(client, acct["id"], "10", food).status_code == 201
    types = [a["type"] for a in client.get("/alerts").json()]
    assert types.count("threshold_50") == 1


def test_dip_and_recross_does_not_refire(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    make_budget(client, amount="1000")
    txn = add_expense(client, acct["id"], "850", food).json()
    assert "threshold_80" in [a["type"] for a in client.get("/alerts").json()]
    # Spend less: still above... reduce below 80 then cross again.
    assert client.patch(f"/transactions/{txn['id']}", json={"amount": "100"}).status_code == 200
    assert add_expense(client, acct["id"], "800", food).status_code == 201
    types = [a["type"] for a in client.get("/alerts").json()]
    assert types.count("threshold_80") == 1


def test_currency_isolation(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    make_budget(client, amount="1000", currency="NGN")
    assert add_expense(client, acct["id"], "900", food, currency="USD").status_code == 201
    assert client.get("/alerts").json() == []


def test_edit_delete_recalculate_and_history_kept(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    make_budget(client, amount="1000")
    txn = add_expense(client, acct["id"], "850", food).json()
    before = client.get("/alerts").json()
    assert len(before) == 1
    # Delete the expense: budget recalculates, alert history stays.
    assert client.delete(f"/transactions/{txn['id']}").status_code == 200
    after = client.get("/alerts").json()
    assert len(after) == 1
    assert after[0]["type"] == "threshold_80"


def test_alerts_read_and_unread_count(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    make_budget(client)
    assert add_expense(client, acct["id"], "850", food).status_code == 201
    assert client.get("/alerts/unread-count").json() == {"unread": 1}
    alert = client.get("/alerts").json()[0]
    assert alert["is_read"] is False
    r = client.patch(f"/alerts/{alert['id']}/read")
    assert r.status_code == 200
    assert r.json()["is_read"] is True
    assert client.get("/alerts/unread-count").json() == {"unread": 0}


def test_user_isolation(client):
    register(client, email="a@example.com")
    acct = make_account(client)
    food = cat_id("Food", "expense")
    make_budget(client)
    assert add_expense(client, acct["id"], "850", food).status_code == 201

    from fastapi.testclient import TestClient as TC

    with TC(app) as other:
        assert other.post(
            "/auth/register",
            json={"name": "B", "email": "b@example.com", "password": "Pass1234"},
        ).status_code == 201
        assert other.get("/alerts").json() == []
        assert other.get("/alert-preferences").json()["budgets"] == []
        assert other.patch("/alerts/1/read").status_code == 404


def test_insights_summary_grouping(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    transport = cat_id("Transportation", "expense")
    assert add_expense(client, acct["id"], "30000", food, day="2026-10-05").status_code == 201
    assert add_expense(client, acct["id"], "5000", transport, day="2026-10-06").status_code == 201
    assert add_expense(client, acct["id"], "10000", food, day="2026-09-10").status_code == 201
    assert add_expense(client, acct["id"], "50", food, currency="USD", day="2026-10-07").status_code == 201
    r = client.get("/insights/summary", params={
        "currency": "NGN", "period_start": "2026-10-01", "period_end": "2026-10-31"})
    assert r.status_code == 200, r.text
    body = r.json()
    by_cat = {c["category_name"]: c for c in body["by_category"]}
    assert Decimal(by_cat["Food"]["current"]) == Decimal("30000")
    assert Decimal(by_cat["Food"]["previous"]) == Decimal("10000")
    assert Decimal(by_cat["Food"]["difference"]) == Decimal("20000")
    assert by_cat["Food"]["percent_change"] == pytest.approx(200.0)
    assert Decimal(by_cat["Transportation"]["current"]) == Decimal("5000")
    # USD expense never merged into NGN figures.
    assert all(c["category_name"] != "USD" for c in body["by_category"])


def test_insights_zero_previous_no_percentage(client):
    register(client)
    acct = make_account(client)
    food = cat_id("Food", "expense")
    assert add_expense(client, acct["id"], "7000", food, day="2026-10-05").status_code == 201
    r = client.get("/insights/summary", params={
        "currency": "NGN", "period_start": "2026-10-01", "period_end": "2026-10-31"})
    row = next(c for c in r.json()["by_category"] if c["category_name"] == "Food")
    assert row["percent_change"] is None
    assert "previous period" in row["note"].lower()


def test_insights_validation(client):
    register(client)
    base = {"currency": "NGN", "period_start": "2026-10-01", "period_end": "2026-10-31"}
    assert client.get("/insights/summary", params={**base, "currency": "JPY"}).status_code == 422
    assert client.get("/insights/summary", params={
        **base, "period_start": "2026-10-31", "period_end": "2026-10-01"}).status_code == 422
