"""Exchange-rate cache status, refresh, and conversion (Phase 4).

Read-only except for the system refresh operation, which pulls from the
external provider through the backend and upserts the PostgreSQL cache.
There is no user rate-editing endpoint. Conversion is reporting-only;
historical records are never rewritten.
"""

from datetime import datetime
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import fx_provider
from ..auth import get_current_user, get_db
from ..currency import (
    MVP_CURRENCIES,
    convert_with_cache,
    list_cached_rates,
    upsert_rates,
)
from ..models import User

router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])


def _serialize_row(row) -> dict:
    fetched = row.fetched_at
    if isinstance(fetched, datetime):
        fetched_iso = fetched.isoformat()
    else:
        fetched_iso = str(fetched)
    return {
        "from_currency": row.from_currency,
        "to_currency": row.to_currency,
        "rate": str(row.rate),
        "provider": row.provider,
        "fetched_at": fetched_iso,
    }


@router.get("/status")
def rates_status(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> dict:
    rows = list_cached_rates(db)
    payload = [_serialize_row(r) for r in rows]
    last_updated = max((r["fetched_at"] for r in payload), default=None)
    providers = sorted({r["provider"] for r in payload})
    return {
        "base": "NGN",
        "count": len(payload),
        "rates": payload,
        "last_updated": last_updated,
        "providers": providers,
    }


@router.post("/refresh")
def refresh_rates(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> dict:
    try:
        base_rates, fetched_at, provider = fx_provider.fetch_latest_rates("NGN")
        pairs = fx_provider.build_pairs(base_rates)
        count = upsert_rates(db, pairs, provider, fetched_at)
        return {
            "ok": True,
            "cached": False,
            "provider": provider,
            "fetched_at": fetched_at.isoformat(),
            "count": count,
        }
    except fx_provider.FxProviderError:
        rows = list_cached_rates(db)
        if rows:
            payload = [_serialize_row(r) for r in rows]
            last_updated = max(r["fetched_at"] for r in payload)
            return {
                "ok": True,
                "cached": True,
                "detail": "FX provider unavailable, serving cached rates",
                "last_updated": last_updated,
                "count": len(payload),
                "rates": payload,
            }
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="conversion unavailable",
        )


@router.get("/convert")
def convert(
    from_currency: str = Query(..., description="Source MVP currency"),
    to_currency: str = Query(..., description="Target MVP currency"),
    amount: str = Query(..., description="Non-negative amount"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> dict:
    if from_currency not in MVP_CURRENCIES or to_currency not in MVP_CURRENCIES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Currency must be one of {', '.join(MVP_CURRENCIES)}",
        )
    try:
        dec_amount = Decimal(amount)
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Amount must be a valid non-negative number",
        )
    if dec_amount < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Amount must be non-negative",
        )
    result = convert_with_cache(db, dec_amount, from_currency, to_currency)
    if not result["available"]:
        return {
            "from_currency": from_currency,
            "to_currency": to_currency,
            "amount": str(dec_amount),
            "converted_amount": None,
            "rate": None,
            "provider": None,
            "fetched_at": None,
            "available": False,
            "cached": False,
            "message": "conversion unavailable",
        }
    fetched = result["fetched_at"]
    return {
        "from_currency": from_currency,
        "to_currency": to_currency,
        "amount": str(dec_amount),
        "converted_amount": str(result["converted_amount"]),
        "rate": str(result["rate"]),
        "provider": result["provider"],
        "fetched_at": fetched.isoformat() if isinstance(fetched, datetime) else None,
        "available": True,
        "cached": bool(result["cached"]),
    }
