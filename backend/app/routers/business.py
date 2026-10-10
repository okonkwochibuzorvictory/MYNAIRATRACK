"""Business Mode (Phase 11).

Opt-in per user (users.business_mode, default OFF). Business views show
only business records; personal views show only personal records — both
enforced in backend queries. Profit is computed per currency as
(sales + business income) − business expenses; different currencies are
never combined. Activating or deactivating never creates, deletes,
reclassifies, or converts any record.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..alerting import budget_percent
from ..auth import get_current_user, get_db
from ..currency import validate_currency
from ..models import Account, Budget, Transaction, User

router = APIRouter(prefix="/business", tags=["business"])


def require_active_mode(current_user: User, db: Session) -> User:
    fresh = db.get(User, current_user.id)
    if fresh is None or not fresh.business_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Business Mode is not activated",
        )
    return fresh


def _business_txns(db: Session, user_id: int):
    return db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_business.is_(True),
    )


@router.get("/status")
def get_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    fresh = db.get(User, current_user.id)
    return {"active": bool(fresh and fresh.business_mode)}


@router.post("/activate")
def activate(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    fresh = db.get(User, current_user.id)
    assert fresh is not None
    fresh.business_mode = True
    db.add(fresh)
    db.commit()
    return {"active": True}


@router.post("/deactivate")
def deactivate(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    fresh = db.get(User, current_user.id)
    assert fresh is not None
    fresh.business_mode = False
    db.add(fresh)
    db.commit()
    return {"active": False}


@router.get("/summary")
def get_summary(
    currency: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    require_active_mode(current_user, db)
    if currency is not None:
        try:
            validate_currency(currency)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Currency must be one of NGN, USD, EUR, GBP",
            )
    q = _business_txns(db, current_user.id)
    if currency is not None:
        q = q.filter(Transaction.currency == currency)
    txns = q.all()
    buckets: dict[str, dict[str, Decimal]] = {}
    by_account: dict[int, dict[str, Decimal]] = {}
    for txn in txns:
        bucket = buckets.setdefault(
            txn.currency,
            {"sales": Decimal("0"), "income": Decimal("0"), "expenses": Decimal("0")},
        )
        entry = by_account.setdefault(
            txn.account_id,
            {"sales": Decimal("0"), "income": Decimal("0"), "expenses": Decimal("0")},
        )
        if txn.type == "sale":
            bucket["sales"] += txn.amount
            entry["sales"] += txn.amount
        elif txn.type == "income":
            bucket["income"] += txn.amount
            entry["income"] += txn.amount
        else:
            bucket["expenses"] += txn.amount
            entry["expenses"] += txn.amount
    per_currency = []
    for code in sorted(buckets):
        b = buckets[code]
        profit = b["sales"] + b["income"] - b["expenses"]
        per_currency.append(
            {
                "currency": code,
                "sales": str(b["sales"]),
                "income": str(b["income"]),
                "expenses": str(b["expenses"]),
                "profit": str(profit),
            }
        )
    accounts = []
    for biz_acct in (
        db.query(Account)
        .filter(Account.user_id == current_user.id, Account.is_business.is_(True))
        .order_by(Account.name)
        .all()
    ):
        if currency is not None and biz_acct.currency != currency:
            continue
        e = by_account.get(
            biz_acct.id,
            {"sales": Decimal("0"), "income": Decimal("0"), "expenses": Decimal("0")},
        )
        profit = e["sales"] + e["income"] - e["expenses"]
        accounts.append(
            {
                "account_id": biz_acct.id,
                "account_name": biz_acct.name,
                "currency": biz_acct.currency,
                "sales": str(e["sales"]),
                "income": str(e["income"]),
                "expenses": str(e["expenses"]),
                "profit": str(profit),
            }
        )
    return {"per_currency": per_currency, "accounts": accounts}


@router.get("/transactions")
def get_history(
    currency: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    require_active_mode(current_user, db)
    if currency is not None:
        try:
            validate_currency(currency)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Currency must be one of NGN, USD, EUR, GBP",
            )
    q = _business_txns(db, current_user.id)
    if currency is not None:
        q = q.filter(Transaction.currency == currency)
    rows = q.order_by(Transaction.date.desc(), Transaction.id.desc()).all()
    out = []
    for t in rows:
        account = db.get(Account, t.account_id)
        out.append(
            {
                "id": t.id,
                "account_id": t.account_id,
                "account_name": account.name if account else None,
                "type": t.type,
                "amount": str(t.amount),
                "currency": t.currency,
                "category_id": t.category_id,
                "date": t.date.isoformat(),
                "note": t.note,
            }
        )
    return out


@router.get("/budgets")
def get_budgets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    require_active_mode(current_user, db)
    rows = (
        db.query(Budget)
        .filter(Budget.user_id == current_user.id, Budget.is_business.is_(True))
        .order_by(Budget.id)
        .all()
    )
    out = []
    for b in rows:
        spent = sum(
            (
                t.amount
                for t in db.query(Transaction)
                .filter(
                    Transaction.user_id == current_user.id,
                    Transaction.type == "expense",
                    Transaction.is_business.is_(True),
                    Transaction.currency == b.currency,
                    Transaction.date >= b.period_start,
                    Transaction.date <= b.period_end,
                )
                .all()
            ),
            Decimal("0"),
        )
        pct = budget_percent(spent, b.amount)
        out.append(
            {
                "id": b.id,
                "name": b.name,
                "amount": str(b.amount),
                "currency": b.currency,
                "period_start": b.period_start.isoformat(),
                "period_end": b.period_end.isoformat(),
                "total_spent": str(spent),
                "remaining": str(b.amount - spent),
                "percent_used": float(pct),
            }
        )
    return out
