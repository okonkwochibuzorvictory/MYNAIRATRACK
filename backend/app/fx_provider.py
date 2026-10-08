"""External FX provider adapter (Phase 4).

Replaceable interface: the app only talks to fetch_latest_rates().
The default MVP provider is open.er-api.com (free, no key). React must
never call the provider directly — only this backend module uses httpx.

Flow: External FX API -> FastAPI (here) -> PostgreSQL cached rates
      -> reporting/consolidation. Keys stay in backend env only.
"""

import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import httpx

from .currency import MVP_CURRENCIES


class FxProviderError(Exception):
    pass


def provider_name() -> str:
    return os.getenv("FX_PROVIDER", "open-er-api")


def base_url() -> str:
    return os.getenv("FX_BASE_URL", "https://open.er-api.com/v6/latest")


def api_key() -> str:
    return os.getenv("FX_API_KEY", "")


def fetch_latest_rates(base: str = "NGN") -> tuple[dict[str, Decimal], datetime, str]:
    """Fetch rates-per-base from the provider.

    Returns (rates_by_code, fetched_at, provider). Raises FxProviderError
    on any failure so callers can fall back to the PostgreSQL cache.
    """
    name = provider_name()
    url = f"{base_url().rstrip('/')}/{base}"
    params: dict[str, str] = {}
    key = api_key()
    if key:
        params["apikey"] = key
    try:
        resp = httpx.get(url, params=params or None, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise FxProviderError(f"FX provider request failed: {exc}") from exc
    try:
        if data.get("result") != "success":
            raise FxProviderError(f"FX provider error: {data.get('error-type', 'unknown')}")
        raw_rates = data.get("rates", {})
        rates: dict[str, Decimal] = {}
        for code in MVP_CURRENCIES:
            if code == base:
                rates[code] = Decimal("1")
                continue
            if code not in raw_rates:
                raise FxProviderError(f"FX provider missing rate for {code}")
            try:
                value = Decimal(str(raw_rates[code]))
            except (InvalidOperation, ValueError, TypeError) as exc:
                raise FxProviderError(f"FX provider bad rate for {code}") from exc
            if value <= 0:
                raise FxProviderError(f"FX provider non-positive rate for {code}")
            rates[code] = value
        fetched_at = datetime.now(timezone.utc)
        return rates, fetched_at, name
    except FxProviderError:
        raise
    except Exception as exc:
        raise FxProviderError(f"FX provider bad response: {exc}") from exc


def build_pairs(base_rates: dict[str, Decimal]) -> dict[tuple[str, str], Decimal]:
    """Expand per-base rates into all directed MVP pairs.

    rate(from -> to) = base_rates[to] / base_rates[from].
    """
    pairs: dict[tuple[str, str], Decimal] = {}
    for from_code in MVP_CURRENCIES:
        for to_code in MVP_CURRENCIES:
            if from_code == to_code:
                continue
            pairs[(from_code, to_code)] = base_rates[to_code] / base_rates[from_code]
    return pairs
