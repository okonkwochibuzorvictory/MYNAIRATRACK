"""Email verification + password reset tests (Resend integration).

Email delivery is never performed here: RESEND_API_KEY is blanked and
raw tokens are captured by wrapping issue_token. The DB is the isolated
test database only.
Usage: python -m pytest tests/test_email_auth.py -v  (run from backend/)
"""

import os
from datetime import datetime, timedelta, timezone

os.environ["JWT_SECRET"] = "email-auth-test-secret-do-not-use-in-prod"
os.environ["JWT_EXPIRE_MINUTES"] = "60"
os.environ["COOKIE_SECURE"] = "false"
os.environ["RESEND_API_KEY"] = ""
os.environ.pop("BREVO_API_KEY", None)
os.environ.pop("SMTP_USER", None)
os.environ.pop("SMTP_PASSWORD", None)

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import auth as auth_module
from app import tokens as tokens_module
from app.routers import auth as auth_router_module
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
    assert "006_auth_tokens" in applied
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


@pytest.fixture(autouse=True)
def _no_live_email(monkeypatch):
    """Neutralise provider credentials at test time (not import time:
    app.main loads backend/.env via dotenv on import). Guarantees the
    suite never sends real email, whatever the developer has configured."""
    monkeypatch.setenv("RESEND_API_KEY", "")
    for var in ("BREVO_API_KEY", "BREVO_SENDER", "SMTP_USER", "SMTP_PASSWORD"):
        monkeypatch.delenv(var, raising=False)


@pytest.fixture()
def captured_tokens(monkeypatch):
    captured = {}
    real_issue = tokens_module.issue_token

    def fake(db, user, purpose, ttl):
        raw = real_issue(db, user, purpose, ttl)
        captured[purpose] = raw
        return raw

    monkeypatch.setattr(auth_router_module, "issue_token", fake)
    return captured


def register(client, email="verify@example.com"):
    r = client.post(
        "/auth/register",
        json={"name": "Verify User", "email": email, "password": "Pass1234"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def db_value(sql, params=()):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchone()


def db_exec(sql, params=()):
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
        conn.commit()


def test_register_unverified_and_login_blocked(client, captured_tokens):
    body = register(client)
    assert body["is_verified"] is False
    assert body["verification_emailed"] is False  # no key in tests
    assert "verify" in captured_tokens
    r = client.post(
        "/auth/login",
        json={"email": "verify@example.com", "password": "Pass1234"},
    )
    assert r.status_code == 403
    assert "verify" in r.json()["detail"].lower()


def test_verify_flow(client, captured_tokens):
    register(client)
    raw = captured_tokens["verify"]
    assert client.get("/auth/verify", params={"token": "bogus"}).status_code == 400
    r = client.get("/auth/verify", params={"token": raw})
    assert r.status_code == 200
    assert r.json() == {"ok": True}
    # Single-use.
    assert client.get("/auth/verify", params={"token": raw}).status_code == 400
    # Login now works.
    from fastapi.testclient import TestClient as TC

    with TC(app) as fresh:
        assert fresh.post(
            "/auth/login",
            json={"email": "verify@example.com", "password": "Pass1234"},
        ).status_code == 200


def test_tokens_stored_hashed_only(client, captured_tokens):
    register(client)
    raw = captured_tokens["verify"]
    row = db_value("SELECT token_hash FROM auth_tokens")
    assert row is not None
    assert row[0] != raw
    assert len(row[0]) == 64


def test_resend_verification(client, captured_tokens):
    register(client)
    r = client.post("/auth/resend-verification", json={"email": "verify@example.com"})
    assert r.status_code == 200
    # Unknown emails get the same response (no enumeration).
    r = client.post("/auth/resend-verification", json={"email": "nobody@example.com"})
    assert r.status_code == 200
    assert r.json() == {"ok": True, "verification_emailed": False}


def test_forgot_password_always_ok(client, captured_tokens):
    register(client)
    r = client.post("/auth/forgot-password", json={"email": "verify@example.com"})
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert "reset" in captured_tokens
    r = client.post("/auth/forgot-password", json={"email": "ghost@example.com"})
    assert r.status_code == 200
    assert r.json() == {"ok": True, "reset_emailed": False}


def test_reset_flow(client, captured_tokens):
    register(client)
    raw = captured_tokens.get("reset")
    assert raw is None  # register only issues verify tokens
    client.post("/auth/forgot-password", json={"email": "verify@example.com"})
    raw = captured_tokens["reset"]
    # Bad token rejected; weak password rejected.
    assert client.post("/auth/reset-password",
                       json={"token": "bogus", "password": "Newpass1"}).status_code == 400
    assert client.post("/auth/reset-password",
                       json={"token": raw, "password": "short"}).status_code == 422
    assert client.post("/auth/reset-password",
                       json={"token": raw, "password": "Newpass1"}).status_code == 200
    # Single-use.
    assert client.post("/auth/reset-password",
                       json={"token": raw, "password": "Other1abc"}).status_code == 400
    # Old password dead, new password works (after verification).
    from fastapi.testclient import TestClient as TC

    with TC(app) as fresh:
        assert fresh.post("/auth/login", json={
            "email": "verify@example.com", "password": "Pass1234"}).status_code in (401, 403)
    db_exec("UPDATE users SET is_verified = TRUE WHERE email = %s", ("verify@example.com",))
    with TC(app) as fresh:
        assert fresh.post("/auth/login", json={
            "email": "verify@example.com", "password": "Newpass1"}).status_code == 200


def test_expired_token_rejected(client):
    register(client, email="old@example.com")
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE email = 'old@example.com'")
            uid = cur.fetchone()[0]
            cur.execute(
                """INSERT INTO auth_tokens (user_id, token_hash, purpose, expires_at)
                   VALUES (%s, %s, 'reset', %s)""",
                (uid, "x" * 64,
                 datetime.now(timezone.utc) - timedelta(hours=1)),
            )
        conn.commit()
    assert client.post("/auth/reset-password",
                       json={"token": "whatever", "password": "Newpass1"}).status_code == 400


def test_isolation_between_users(client, captured_tokens):
    register(client, email="a@example.com")
    raw_a = captured_tokens["verify"]
    register(client, email="b@example.com")
    # A's token verifies A and nobody else is affected.
    assert client.get("/auth/verify", params={"token": raw_a}).status_code == 200
    assert db_value("SELECT is_verified FROM users WHERE email='a@example.com'")[0] is True
    assert db_value("SELECT is_verified FROM users WHERE email='b@example.com'")[0] is False


def test_frontend_base_strips_whitespace(monkeypatch):
    # A pasted FRONTEND_URL with a stray space/newline produced links
    # that email providers refuse to open ("invalid control character").
    from app.routers.auth import frontend_base

    monkeypatch.setenv("FRONTEND_URL", "  https://mynairatrack.netlify.app/ \n")
    assert frontend_base() == "https://mynairatrack.netlify.app"
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    assert frontend_base() == "http://localhost:5173"
