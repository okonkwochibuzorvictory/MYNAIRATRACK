"""Phase 7 tests: custom categories CRUD, ownership, transaction safety.

Run against the isolated test database only (mynairatrack_test).
Usage: python -m pytest tests/test_phase7.py -v  (run from backend/)
"""

import os

os.environ["JWT_SECRET"] = "phase7-test-secret-do-not-use-in-prod"
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


def register(client, email="cat@example.com"):
    r = client.post(
        "/auth/register",
        json={"name": "Cat User", "email": email, "password": "Pass1234"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def default_id(name, type):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM categories WHERE name=%s AND type=%s AND user_id IS NULL",
                (name, type),
            )
            row = cur.fetchone()
    assert row is not None
    return row[0]


def test_anonymous_access_rejected():
    with TestClient(app) as anon:
        assert anon.get("/categories").status_code == 401
        assert anon.post("/categories", json={"name": "X", "type": "expense"}).status_code == 401
        assert anon.get("/categories/1").status_code == 401
        assert anon.patch("/categories/1", json={"name": "Y"}).status_code == 401
        assert anon.delete("/categories/1").status_code == 401


def test_list_shows_defaults(client):
    register(client)
    rows = client.get("/categories").json()
    assert all(c["is_default"] for c in rows)
    assert len([c for c in rows if c["type"] == "expense"]) == 21
    assert len([c for c in rows if c["type"] == "income"]) == 13
    assert {c["name"] for c in rows if c["is_business"] and c["type"] == "income"} >= {
        "Sales of Goods", "Service Income"}


def test_create_custom_categories(client):
    register(client)
    r = client.post("/categories", json={"name": "Airtime", "type": "expense"})
    assert r.status_code == 201, r.text
    assert r.json()["is_default"] is False
    r = client.post("/categories", json={"name": "Consulting", "type": "income"})
    assert r.status_code == 201, r.text
    names = {c["name"] for c in client.get("/categories").json()}
    assert {"Airtime", "Consulting"} <= names


def test_create_validation(client):
    register(client)
    assert client.post("/categories", json={"name": "   ", "type": "expense"}).status_code == 422
    assert client.post("/categories", json={"name": "X", "type": "bogus"}).status_code == 422


def test_duplicate_rejected_same_type_allowed_across_types(client):
    register(client)
    assert client.post("/categories", json={"name": "Airtime", "type": "expense"}).status_code == 201
    # Same name, same type (case-insensitive) rejected.
    assert client.post("/categories", json={"name": "airtime", "type": "expense"}).status_code == 409
    # Clashes with a default of the same type rejected.
    assert client.post("/categories", json={"name": "Food", "type": "expense"}).status_code == 409
    # Same name across types allowed.
    assert client.post("/categories", json={"name": "Airtime", "type": "income"}).status_code == 201


def test_edit_own_custom_category(client):
    register(client)
    created = client.post("/categories", json={"name": "Airtime", "type": "expense"}).json()
    r = client.patch(f"/categories/{created['id']}", json={"name": "Airtime & Data"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Airtime & Data"
    # Type change rejected.
    r = client.patch(f"/categories/{created['id']}", json={"type": "income"})
    assert r.status_code == 422


def test_cannot_edit_default_category(client):
    register(client)
    food = default_id("Food", "expense")
    r = client.patch(f"/categories/{food}", json={"name": "Snacks"})
    assert r.status_code == 403
    assert client.get(f"/categories/{food}").json()["name"] == "Food"


def test_delete_unused_custom_category(client):
    register(client)
    created = client.post("/categories", json={"name": "Temp", "type": "expense"}).json()
    assert client.delete(f"/categories/{created['id']}").status_code == 200
    assert client.get(f"/categories/{created['id']}").status_code == 404


def test_cannot_delete_default_category(client):
    register(client)
    food = default_id("Food", "expense")
    assert client.delete(f"/categories/{food}").status_code == 403


def test_cannot_delete_category_used_by_transactions(client):
    register(client)
    custom = client.post("/categories", json={"name": "Airtime", "type": "expense"}).json()
    acct = client.post("/accounts", json={"name": "Main", "currency": "NGN"}).json()
    t = client.post(
        "/transactions",
        json={"account_id": acct["id"], "type": "expense", "amount": "500",
              "category_id": custom["id"]},
    )
    assert t.status_code == 201
    r = client.delete(f"/categories/{custom['id']}")
    assert r.status_code == 409
    assert "transaction" in r.json()["detail"].lower()
    # History intact.
    assert len(client.get("/transactions").json()) == 1
    assert client.get(f"/categories/{custom['id']}").status_code == 200


def test_cannot_touch_another_users_category(client):
    register(client, email="a@example.com")
    custom = client.post("/categories", json={"name": "Private", "type": "expense"}).json()

    from fastapi.testclient import TestClient as TC

    with TC(app) as other:
        assert other.post(
            "/auth/register",
            json={"name": "B", "email": "b@example.com", "password": "Pass1234"},
        ).status_code == 201
        assert other.get(f"/categories/{custom['id']}").status_code == 404
        assert other.patch(f"/categories/{custom['id']}", json={"name": "X"}).status_code == 404
        assert other.delete(f"/categories/{custom['id']}").status_code == 404
        names = {c["name"] for c in other.get("/categories").json()}
        assert "Private" not in names

    assert client.get(f"/categories/{custom['id']}").json()["name"] == "Private"


def test_custom_category_usable_in_transactions(client):
    register(client)
    custom = client.post("/categories", json={"name": "Tutoring", "type": "income"}).json()
    acct = client.post("/accounts", json={"name": "Main", "currency": "NGN"}).json()
    r = client.post(
        "/transactions",
        json={"account_id": acct["id"], "type": "income", "amount": "5000",
              "category_id": custom["id"]},
    )
    assert r.status_code == 201, r.text
    assert r.json()["category_name"] == "Tutoring"
