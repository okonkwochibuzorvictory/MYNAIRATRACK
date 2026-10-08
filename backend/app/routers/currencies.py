"""Supported currencies (Phase 4, read-only)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_db
from ..models import Currency, User

router = APIRouter(prefix="/currencies", tags=["currencies"])


@router.get("")
def list_currencies(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
) -> list[dict]:
    rows = db.query(Currency).order_by(Currency.code).all()
    return [{"code": r.code, "name": r.name, "symbol": r.symbol} for r in rows]
