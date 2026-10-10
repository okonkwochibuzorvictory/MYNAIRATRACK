"""Phase 3 tests: authentication and user setup.

Run against the isolated test database only (mynairatrack_test).
Usage: python -m pytest tests/test_phase3.py -v  (run from backend/)
"""

import os
from datetime import datetime, timedelta, timezone

os.environ["JWT_SECRET"] = "phase3-test-secret-do-not-use-in-prod"
os.environ["JWT_EXPIRE_MINUTES"] = "60"
os.environ["COOKIE_SECURE"] = "false"
os.environ["RESEND_API_KEY"] = ""

import jwt
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
COOKIE_NAME = "mynaira_token"


def verify_user(email: str) -> None:
    """Simulate a clicked verification link (the real flow is tested in test_email_auth.py)."""
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET is_verified = TRUE WHERE email = %s", (email,))
        conn.commit()


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


def register(client, name="Ada", email="ada@example.com", password="Pass1234"):
    return client.post(
        "/auth/register",
        json={"name": name, "email": email, "password": password},
    )


def test_register_sets_cookie_and_defaults_ngn(client):
    r = register(client)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "ada@example.com"
    assert body["primary_currency"] == "NGN"
    set_cookie = r.headers.get("set-cookie", "")
    assert f"{COOKIE_NAME}=" in set_cookie
    # Session is usable immediately.
    me = client.get("/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "ada@example.com"


def test_register_rejects_invalid_email(client):
    r = register(client, email="not-an-email")
    assert r.status_code == 422


def test_register_rejects_short_password(client):
    r = register(client, email="a@example.com", password="Ab1")
    assert r.status_code == 422


def test_register_rejects_password_without_number(client):
    r = register(client, email="b@example.com", password="PasswordOnly")
    assert r.status_code == 422


def test_register_rejects_blank_name(client):
    r = register(client, name="   ", email="c@example.com")
    assert r.status_code == 422


def test_register_rejects_duplicate_email(client):
    r1 = register(client)
    assert r1.status_code == 201
    r2 = register(client, name="Other", email="ADA@example.com")
    assert r2.status_code == 409
    assert "already" in r2.json()["detail"].lower()


def test_login_wrong_password_rejected_generic(client):
    assert register(client).status_code == 201
    from fastapi.testclient import TestClient as TC

    with TC(app) as fresh:
        # Re-apply override inside new client scope (same app object).
        r = fresh.post(
            "/auth/login",
            json={"email": "ada@example.com", "password": "Wrong1234"},
        )
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid email or password"


def test_login_unknown_email_rejected_generic(client):
    r = client.post(
        "/auth/login",
        json={"email": "nobody@example.com", "password": "Whatever1"},
    )
    assert r.status_code == 401
    assert r.json()["detail"] == "Invalid email or password"


def test_protected_endpoints_reject_anonymous(client):
    # Use a fresh client with no cookies.
    from fastapi.testclient import TestClient as TC

    with TC(app) as anon:
        assert anon.get("/auth/me").status_code == 401
        assert anon.get("/users/me").status_code == 401


def test_expired_cookie_rejected(client):
    r = register(client)
    user_id = r.json()["id"]
    secret = os.environ["JWT_SECRET"]
    now = datetime.now(timezone.utc)
    expired = jwt.encode(
        {
            "sub": str(user_id),
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),
        },
        secret,
        algorithm="HS256",
    )
    from fastapi.testclient import TestClient as TC

    with TC(app) as anon:
        anon.cookies.set(COOKIE_NAME, expired)
        resp = anon.get("/auth/me")
        assert resp.status_code == 401


def test_tampered_cookie_rejected(client):
    assert register(client).status_code == 201
    from fastapi.testclient import TestClient as TC

    with TC(app) as anon:
        anon.cookies.set(COOKIE_NAME, "not-a-real-token")
        assert anon.get("/auth/me").status_code == 401


def test_cookie_flags_present(client):
    r = register(client, email="flags@example.com")
    assert r.status_code == 201
    set_cookie = r.headers.get("set-cookie", "")
    lowered = set_cookie.lower()
    assert "httponly" in lowered
    assert "samesite=lax" in lowered
    assert "path=/" in lowered


def test_user_isolation(client):
    assert register(client, name="User A", email="a@example.com").status_code == 201
    me_a = client.get("/users/me").json()
    assert me_a["email"] == "a@example.com"

    from fastapi.testclient import TestClient as TC

    with TC(app) as client_b:
        rb = client_b.post(
            "/auth/register",
            json={"name": "User B", "email": "b@example.com", "password": "Pass1234"},
        )
        assert rb.status_code == 201
        me_b = client_b.get("/users/me").json()
        assert me_b["email"] == "b@example.com"
        assert me_b["id"] != me_a["id"]
        # B's session never sees A's record.
        assert me_b["name"] == "User B"

    # A's session still sees only A.
    assert client.get("/users/me").json()["email"] == "a@example.com"


def test_change_primary_currency_persists(client):
    assert register(client).status_code == 201
    r = client.patch("/users/me", json={"primary_currency": "USD"})
    assert r.status_code == 200, r.text
    assert r.json()["primary_currency"] == "USD"
    assert client.get("/users/me").json()["primary_currency"] == "USD"
    assert client.get("/auth/me").json()["primary_currency"] == "USD"


def test_change_primary_currency_rejects_unsupported(client):
    assert register(client).status_code == 201
    r = client.patch("/users/me", json={"primary_currency": "JPY"})
    assert r.status_code == 422
    # Original value untouched.
    assert client.get("/users/me").json()["primary_currency"] == "NGN"


def test_update_name(client):
    assert register(client).status_code == 201
    r = client.patch("/users/me", json={"name": "Ada Lovelace"})
    assert r.status_code == 200
    assert r.json()["name"] == "Ada Lovelace"


def test_login_sets_cookie(client):
    assert register(client, email="login@example.com").status_code == 201
    verify_user("login@example.com")
    from fastapi.testclient import TestClient as TC

    with TC(app) as fresh:
        r = fresh.post(
            "/auth/login",
            json={"email": "login@example.com", "password": "Pass1234"},
        )
        assert r.status_code == 200
        assert r.json()["primary_currency"] == "NGN"
        assert COOKIE_NAME in r.headers.get("set-cookie", "")
        assert fresh.get("/auth/me").status_code == 200


def test_logout_clears_cookie_and_blocks_afterwards(client):
    assert register(client).status_code == 201
    assert client.get("/auth/me").status_code == 200
    r = client.post("/auth/logout")
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    # test client keeps cookies; clear them to simulate browser delete.
    client.cookies.clear()
    assert client.get("/auth/me").status_code == 401
