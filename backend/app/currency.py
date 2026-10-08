"""MVP currency rules and cached-rate conversion helpers (Phase 4).

Reporting/conversion only. Historical amounts/currencies are never
rewritten here — conversion is computed on the fly from the cached
exchange_rates rows for consolidated views.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from .models import ExchangeRate

MVP_CURRENCIES = ("NGN", "USD", "EUR", "GBP")


def is_supported(code: str) -> bool:
    return code in MVP_CURRENCIES


def validate_currency(code: str) -> str:
    if code not in MVP_CURRENCIES:
        raise ValueError(f"Currency must be one of {', '.join(MVP_CURRENCIES)}")
    return code


def convert_amount(amount: Decimal, rate: Decimal) -> Decimal:
    return amount * rate


def get_cached_rate(db: Session, from_currency: str, to_currency: str) -> ExchangeRate | None:
    if from_currency == to_currency:
        return None
    return (
        db.query(ExchangeRate)
        .filter(
            ExchangeRate.from_currency == from_currency,
            ExchangeRate.to_currency == to_currency,
        )
        .first()
    )


def list_cached_rates(db: Session) -> list[ExchangeRate]:
    return (
        db.query(ExchangeRate)
        .order_by(ExchangeRate.from_currency, ExchangeRate.to_currency)
        .all()
    )


def upsert_rates(
    db: Session,
    pairs: dict[tuple[str, str], Decimal],
    provider: str,
    fetched_at: datetime,
) -> int:
    count = 0
    for (from_currency, to_currency), rate in pairs.items():
        validate_currency(from_currency)
        validate_currency(to_currency)
        if from_currency == to_currency:
            continue
        if rate <= 0:
            continue
        existing = get_cached_rate(db, from_currency, to_currency)
        if existing is None:
            db.add(
                ExchangeRate(
                    from_currency=from_currency,
                    to_currency=to_currency,
                    rate=rate,
                    provider=provider,
                    fetched_at=fetched_at,
                )
            )
        else:
            existing.rate = rate
            existing.provider = provider
            existing.fetched_at = fetched_at
        count += 1
    db.commit()
    return count


def convert_with_cache(
    db: Session,
    amount: Decimal,
    from_currency: str,
    to_currency: str,
) -> dict:
    validate_currency(from_currency)
    validate_currency(to_currency)
    if amount < 0:
        raise ValueError("Amount must be non-negative")
    if from_currency == to_currency:
        return {
            "available": True,
            "converted_amount": amount,
            "rate": Decimal("1"),
            "provider": None,
            "fetched_at": None,
            "cached": False,
        }
    row = get_cached_rate(db, from_currency, to_currency)
    if row is None:
        return {
            "available": False,
            "converted_amount": None,
            "rate": None,
            "provider": None,
            "fetched_at": None,
            "cached": False,
        }
    return {
        "available": True,
        "converted_amount": convert_amount(amount, row.rate),
        "rate": row.rate,
        "provider": row.provider,
        "fetched_at": row.fetched_at,
        "cached": True,
    }
