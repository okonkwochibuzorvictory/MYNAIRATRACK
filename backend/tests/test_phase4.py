"""Phase 4 tests: currency foundation, FX cache, conversion, fallback.

Run against the isolated test database only (mynairatrack_test).
Usage: python -m pytest tests/test_phase4.py -v  (run from backend/)
"""

import os
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch

os.environ["JWT_SECRET"] = "phase4-test-secret-do-not-use-in-prod"
os.environ["JWT_EXPIRE_MINUTES"] = "60"
os.environ["COOKIE_SECURE"] = "false"

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import auth as auth_module
from app import fx_provider
from app.currency import MVP_CURRENCIES
from app.currency import convert_with_cache, is_supported, validate_currency
from app.fx_provider import FxProviderError, build_pairs
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


def register(client, email="fx@example.com"):
    return client.post(
        "/auth/register",
        json={"name": "Fx User", "email": email, "password": "Pass1234"},
    )


MOCK_BASE_RATES = {
    "NGN": Decimal("1"),
    "USD": Decimal("0.00065"),
    "EUR": Decimal("0.00060"),
    "GBP": Decimal("0.00052"),
}
MOCK_FETCHED_AT = datetime(2026, 1, 2, 12, 0, 0, tzinfo=timezone.utc)
MOCK_PROVIDER = "open-er-api"


def mock_success(*args, **kwargs):
    return dict(MOCK_BASE_RATES), MOCK_FETCHED_AT, MOCK_PROVIDER


def mock_failure(*args, **kwargs):
    raise FxProviderError("provider down")


def test_mvp_currencies_constant():
    assert tuple(MVP_CURRENCIES) == ("NGN", "USD", "EUR", "GBP")
    assert is_supported("NGN") and is_supported("USD")
    assert not is_supported("JPY")


def test_validate_currency_rejects_unsupported():
    validate_currency("NGN")
    with pytest.raises(ValueError):
        validate_currency("JPY")


def test_currencies_endpoint_returns_four_only(client):
    assert register(client).status_code == 201
    r = client.get("/currencies")
    assert r.status_code == 200, r.text
    codes = sorted([c["code"] for c in r.json()])
    assert codes == ["EUR", "GBP", "NGN", "USD"]
    assert all(c["name"] and c["symbol"] for c in r.json())


def test_currency_endpoints_require_auth():
    with TestClient(app) as anon:
        assert anon.get("/currencies").status_code == 401
        assert anon.get("/exchange-rates/status").status_code == 401
        assert anon.get("/exchange-rates/convert").status_code in (401, 422)


def test_user_currency_still_rejects_jpy(client):
    assert register(client).status_code == 201
    r = client.patch("/users/me", json={"primary_currency": "JPY"})
    assert r.status_code == 422


def test_convert_rejects_unsupported_currency(client):
    assert register(client).status_code == 201
    r = client.get(
        "/exchange-rates/convert",
        params={"from_currency": "JPY", "to_currency": "NGN", "amount": "10"},
    )
    assert r.status_code == 422


def test_convert_rejects_bad_amounts(client):
    assert register(client).status_code == 201
    r = client.get(
        "/exchange-rates/convert",
        params={"from_currency": "USD", "to_currency": "NGN", "amount": "-5"},
    )
    assert r.status_code == 422
    r = client.get(
        "/exchange-rates/convert",
        params={"from_currency": "USD", "to_currency": "NGN", "amount": "abc"},
    )
    assert r.status_code == 422


def test_convert_same_currency_returns_same_amount(client):
    assert register(client).status_code == 201
    r = client.get(
        "/exchange-rates/convert",
        params={"from_currency": "NGN", "to_currency": "NGN", "amount": "500"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert Decimal(body["converted_amount"]) == Decimal("500")
    assert body["rate"] == "1"


def test_convert_missing_rate_returns_unavailable(client):
    assert register(client).status_code == 201
    r = client.get(
        "/exchange-rates/convert",
        params={"from_currency": "USD", "to_currency": "NGN", "amount": "100"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False
    assert body["converted_amount"] is None
    assert body["rate"] is None
    assert body["message"] == "conversion unavailable"


def test_refresh_success_stores_timestamp_and_provider(client):
    assert register(client).status_code == 201
    with patch(
        "app.routers.exchange_rates.fx_provider.fetch_latest_rates",
        side_effect=mock_success,
    ):
        r = client.post("/exchange-rates/refresh")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["cached"] is False
    assert body["provider"] == MOCK_PROVIDER
    assert body["count"] == 12  # all directed pairs among 4 currencies
    assert body["fetched_at"] == MOCK_FETCHED_AT.isoformat()

    st = client.get("/exchange-rates/status").json()
    assert st["count"] == 12
    from datetime import datetime as dt

    assert dt.fromisoformat(st["last_updated"]) == MOCK_FETCHED_AT
    assert MOCK_PROVIDER in st["providers"]
    assert all(row["provider"] == MOCK_PROVIDER for row in st["rates"])
    assert all(
        dt.fromisoformat(row["fetched_at"]) == MOCK_FETCHED_AT for row in st["rates"]
    )


def test_convert_uses_cached_rate_after_refresh(client):
    assert register(client).status_code == 201
    with patch(
        "app.routers.exchange_rates.fx_provider.fetch_latest_rates",
        side_effect=mock_success,
    ):
        assert client.post("/exchange-rates/refresh").status_code == 200
    r = client.get(
        "/exchange-rates/convert",
        params={"from_currency": "USD", "to_currency": "NGN", "amount": "100"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is True
    assert body["cached"] is True
    assert body["provider"] == MOCK_PROVIDER
    # 100 USD at 1/0.00065 NGN per USD.
    expected = Decimal("100") / MOCK_BASE_RATES["USD"]
    assert abs(Decimal(body["converted_amount"]) - expected) < Decimal("0.01")


def test_build_pairs_math():
    pairs = build_pairs(dict(MOCK_BASE_RATES))
    assert pairs[("NGN", "USD")] == Decimal("0.00065")
    assert pairs[("USD", "NGN")] == Decimal("1") / Decimal("0.00065")
    assert pairs[("USD", "EUR")] == Decimal("0.00060") / Decimal("0.00065")


def test_provider_failure_serves_cached_rates(client):
    assert register(client).status_code == 201
    with patch(
        "app.routers.exchange_rates.fx_provider.fetch_latest_rates",
        side_effect=mock_success,
    ):
        assert client.post("/exchange-rates/refresh").status_code == 200
    with patch(
        "app.routers.exchange_rates.fx_provider.fetch_latest_rates",
        side_effect=mock_failure,
    ):
        r = client.post("/exchange-rates/refresh")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["cached"] is True
    assert "cached" in body["detail"].lower()
    # Conversion still works from cache after provider failure.
    c = client.get(
        "/exchange-rates/convert",
        params={"from_currency": "EUR", "to_currency": "NGN", "amount": "10"},
    )
    assert c.json()["available"] is True


def test_provider_failure_with_no_cache_returns_503(client):
    assert register(client).status_code == 201
    with patch(
        "app.routers.exchange_rates.fx_provider.fetch_latest_rates",
        side_effect=mock_failure,
    ):
        r = client.post("/exchange-rates/refresh")
    assert r.status_code == 503
    assert r.json()["detail"] == "conversion unavailable"


def test_refresh_does_not_rewrite_user_history(client):
    assert register(client, email="keep@example.com").status_code == 201
    before = client.get("/users/me").json()
    with patch(
        "app.routers.exchange_rates.fx_provider.fetch_latest_rates",
        side_effect=mock_success,
    ):
        assert client.post("/exchange-rates/refresh").status_code == 200
    after = client.get("/users/me").json()
    assert before == after
    with psycopg.connect(TEST_DATABASE_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM users")
            assert cur.fetchone()[0] == 1
            cur.execute("SELECT COUNT(*) FROM transactions")
            assert cur.fetchone()[0] == 0


def test_convert_with_cache_unit_never_invents_rate(reset_db):
    engine = create_engine(TEST_DATABASE_URL)
    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()
    try:
        result = convert_with_cache(db, Decimal("10"), "USD", "NGN")
        assert result["available"] is False
        assert result["converted_amount"] is None
    finally:
        db.close()
        engine.dispose()


def test_fx_provider_error_class_importable():
    assert issubclass(FxProviderError, Exception)
    assert callable(fx_provider.fetch_latest_rates)
