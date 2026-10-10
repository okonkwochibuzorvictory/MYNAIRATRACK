"""Spending insights (Phase 10, read-only reporting).

All figures are grouped in a single requested currency — never mixed.
Previous-period comparison uses the equal-length span immediately before
the selected range. When previous spending is zero, no percentage is
invented; a message is returned instead.
"""

from datetime import date as date_cls
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..alerting import budget_percent, budget_spent
from ..auth import get_current_user, get_db
from ..currency import validate_currency
from ..models import Budget, Category, Transaction, User

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/summary")
def summary(
    currency: str = Query(...),
    period_start: date_cls = Query(...),
    period_end: date_cls = Query(...),
    scope: str = Query(default="personal"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    try:
        validate_currency(currency)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Currency must be one of NGN, USD, EUR, GBP",
        )
    if scope not in ("personal", "business"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Scope must be personal or business",
        )
    if scope == "business":
        fresh = db.get(User, current_user.id)
        if fresh is None or not fresh.business_mode:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Business Mode is not activated",
            )
    business_only = scope == "business"
    if period_end < period_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="End date cannot be before start date",
        )

    days = (period_end - period_start).days + 1
    prev_end = period_start.fromordinal(period_start.toordinal() - 1)
    prev_start = prev_end.fromordinal(prev_end.toordinal() - days + 1)

    def totals(start: date_cls, end: date_cls) -> dict[int | None, Decimal]:
        rows = (
            db.query(Transaction.category_id, Transaction.amount)
            .filter(
                Transaction.user_id == current_user.id,
                Transaction.type == "expense",
                Transaction.is_business.is_(business_only),
                Transaction.currency == currency,
                Transaction.date >= start,
                Transaction.date <= end,
            )
            .all()
        )
        out: dict[int | None, Decimal] = {}
        for category_id, amount in rows:
            out[category_id] = out.get(category_id, Decimal("0")) + amount
        return out

    current = totals(period_start, period_end)
    previous = totals(prev_start, prev_end)
    category_ids = {c for c in list(current) + list(previous) if c is not None}
    names = (
        {
            c.id: c.name
            for c in db.query(Category).filter(Category.id.in_(category_ids)).all()
        }
        if category_ids
        else {}
    )

    by_category = []
    for category_id in sorted(set(current) | set(previous), key=lambda c: str(c)):
        cur = current.get(category_id, Decimal("0"))
        prev = previous.get(category_id, Decimal("0"))
        diff = cur - prev
        if prev == 0:
            pct = None
            note = "No spending in the previous period" if cur > 0 else "No spending in either period"
        else:
            pct = float(diff / prev * 100)
            note = ""
        by_category.append(
            {
                "category_id": category_id,
                "category_name": names.get(category_id, "Uncategorized"),
                "current": str(cur),
                "previous": str(prev),
                "difference": str(diff),
                "percent_change": pct,
                "note": note,
            }
        )

    budgets = (
        db.query(Budget)
        .filter(
            Budget.user_id == current_user.id,
            Budget.is_business.is_(business_only),
        )
        .all()
    )
    budget_usage = []
    for b in budgets:
        if b.currency != currency:
            continue
        spent = budget_spent(db, current_user.id, b)
        pct = budget_percent(spent, b.amount)
        budget_usage.append(
            {
                "budget_id": b.id,
                "budget_name": b.name,
                "spent": str(spent),
                "amount": str(b.amount),
                "percent_used": float(pct),
            }
        )

    return {
        "currency": currency,
        "period": {"start": period_start.isoformat(), "end": period_end.isoformat()},
        "previous_period": {"start": prev_start.isoformat(), "end": prev_end.isoformat()},
        "by_category": by_category,
        "budgets": budget_usage,
    }
