"""Savings targets and financial goals routes (Phase 9).

Planning/tracking tools only: they never move money, require no linked
account, create no transactions, and never touch account balances.
Progress is a manually updated amount in the record's own currency —
ordinary transactions are never treated as contributions.

Progress rules: remaining = max(target - current, 0); displayed
percentage capped at 100% (actual amount preserved, exceeded flagged);
Completed once current >= target; goals add Overdue for incomplete past
deadlines. Currency change is blocked once progress exists and amounts
are never converted.
"""

from datetime import date as date_cls
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_db
from ..currency import validate_currency
from ..models import Goal, SavingsTarget, User

savings_router = APIRouter(prefix="/savings-targets", tags=["savings-targets"])
goals_router = APIRouter(prefix="/goals", tags=["goals"])


def _progress(target: Decimal, current: Decimal) -> dict:
    remaining = target - current
    if remaining < 0:
        remaining = Decimal("0")
    pct = (current / target * 100) if target > 0 else Decimal("0")
    if pct > 100:
        pct = Decimal("100")
    exceeded = current - target if current > target else Decimal("0")
    return {
        "remaining": str(remaining),
        "percent_complete": float(pct),
        "exceeded_by": str(exceeded),
    }


def _savings_status(target: Decimal, current: Decimal) -> str:
    return "Completed" if current >= target else "In Progress"


def _goal_status(target: Decimal, current: Decimal, deadline: date_cls | None) -> str:
    if current >= target:
        return "Completed"
    if deadline is not None and deadline < date_cls.today():
        return "Overdue"
    return "In Progress"


def _name_validator(value: str) -> str:
    if not value.strip():
        raise ValueError("Name is required")
    if len(value.strip()) > 128:
        raise ValueError("Name is too long")
    return value.strip()


def _target_validator(value: str) -> str:
    try:
        dec = Decimal(value)
    except Exception:
        raise ValueError("Target amount must be a valid number")
    if dec <= 0:
        raise ValueError("Target amount must be greater than zero")
    return value


def _current_validator(value: str) -> str:
    try:
        dec = Decimal(value)
    except Exception:
        raise ValueError("Progress amount must be a valid number")
    if dec < 0:
        raise ValueError("Progress amount cannot be negative")
    return value


class SavingsCreate(BaseModel):
    name: str
    target_amount: str
    currency: str
    current_amount: str = "0"

    @field_validator("name")
    @classmethod
    def name_valid(cls, value: str) -> str:
        return _name_validator(value)

    @field_validator("target_amount")
    @classmethod
    def target_valid(cls, value: str) -> str:
        return _target_validator(value)

    @field_validator("current_amount")
    @classmethod
    def current_valid(cls, value: str) -> str:
        return _current_validator(value)

    @field_validator("currency")
    @classmethod
    def currency_supported(cls, value: str) -> str:
        return validate_currency(value)


class SavingsUpdate(BaseModel):
    name: str | None = None
    target_amount: str | None = None
    currency: str | None = None
    current_amount: str | None = None

    @field_validator("name")
    @classmethod
    def name_valid(cls, value: str | None) -> str | None:
        return None if value is None else _name_validator(value)

    @field_validator("target_amount")
    @classmethod
    def target_valid(cls, value: str | None) -> str | None:
        return None if value is None else _target_validator(value)

    @field_validator("currency")
    @classmethod
    def currency_valid(cls, value: str | None) -> str | None:
        return None if value is None else validate_currency(value)

    @field_validator("current_amount")
    @classmethod
    def current_valid(cls, value: str | None) -> str | None:
        return None if value is None else _current_validator(value)


class GoalCreate(SavingsCreate):
    deadline: date_cls | None = None
    suggested_contribution: str | None = None

    @field_validator("suggested_contribution")
    @classmethod
    def contribution_valid(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            dec = Decimal(value)
        except Exception:
            raise ValueError("Suggested contribution must be a valid number")
        if dec < 0:
            raise ValueError("Suggested contribution cannot be negative")
        return value


class GoalUpdate(SavingsUpdate):
    deadline: date_cls | None = None
    suggested_contribution: str | None = None

    @field_validator("suggested_contribution")
    @classmethod
    def contribution_valid(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            dec = Decimal(value)
        except Exception:
            raise ValueError("Suggested contribution must be a valid number")
        if dec < 0:
            raise ValueError("Suggested contribution cannot be negative")
        return value


def to_savings_out(row: SavingsTarget) -> dict:
    payload = {
        "id": row.id,
        "name": row.name,
        "target_amount": str(row.target_amount),
        "current_amount": str(row.current_amount),
        "currency": row.currency,
    }
    payload.update(_progress(row.target_amount, row.current_amount))
    payload["status"] = _savings_status(row.target_amount, row.current_amount)
    return payload


def to_goal_out(row: Goal) -> dict:
    payload = {
        "id": row.id,
        "name": row.name,
        "target_amount": str(row.target_amount),
        "current_amount": str(row.current_amount),
        "currency": row.currency,
        "deadline": row.deadline.isoformat() if row.deadline else None,
        "suggested_contribution": str(row.suggested_contribution)
        if row.suggested_contribution is not None
        else None,
    }
    payload.update(_progress(row.target_amount, row.current_amount))
    payload["status"] = _goal_status(row.target_amount, row.current_amount, row.deadline)
    return payload


def _owned_savings(db: Session, user_id: int, record_id: int) -> SavingsTarget:
    row = (
        db.query(SavingsTarget)
        .filter(SavingsTarget.id == record_id, SavingsTarget.user_id == user_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings target not found")
    return row


def _owned_goal(db: Session, user_id: int, record_id: int) -> Goal:
    row = (
        db.query(Goal)
        .filter(Goal.id == record_id, Goal.user_id == user_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return row


def _guard_currency_change(current: Decimal, new_currency: str | None, old_currency: str) -> None:
    if new_currency is not None and new_currency != old_currency and current > 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Currency cannot be changed once there is progress",
        )


@savings_router.post("", status_code=status.HTTP_201_CREATED)
def create_savings(
    data: SavingsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = SavingsTarget(
        user_id=current_user.id,
        name=data.name,
        target_amount=Decimal(data.target_amount),
        current_amount=Decimal(data.current_amount),
        currency=data.currency,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_savings_out(row)


@savings_router.get("")
def list_savings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    rows = (
        db.query(SavingsTarget)
        .filter(SavingsTarget.user_id == current_user.id)
        .order_by(SavingsTarget.id)
        .all()
    )
    return [to_savings_out(r) for r in rows]


@savings_router.get("/{record_id}")
def get_savings(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return to_savings_out(_owned_savings(db, current_user.id, record_id))


@savings_router.patch("/{record_id}")
def update_savings(
    record_id: int,
    data: SavingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = _owned_savings(db, current_user.id, record_id)
    _guard_currency_change(row.current_amount, data.currency, row.currency)
    if data.name is not None:
        row.name = data.name
    if data.target_amount is not None:
        row.target_amount = Decimal(data.target_amount)
    if data.currency is not None:
        row.currency = data.currency
    if data.current_amount is not None:
        row.current_amount = Decimal(data.current_amount)
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_savings_out(row)


@savings_router.delete("/{record_id}")
def delete_savings(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    db.delete(_owned_savings(db, current_user.id, record_id))
    db.commit()
    return {"ok": True}


@goals_router.post("", status_code=status.HTTP_201_CREATED)
def create_goal(
    data: GoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = Goal(
        user_id=current_user.id,
        name=data.name,
        target_amount=Decimal(data.target_amount),
        current_amount=Decimal(data.current_amount),
        currency=data.currency,
        deadline=data.deadline,
        suggested_contribution=Decimal(data.suggested_contribution)
        if data.suggested_contribution is not None
        else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_goal_out(row)


@goals_router.get("")
def list_goals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    rows = (
        db.query(Goal)
        .filter(Goal.user_id == current_user.id)
        .order_by(Goal.id)
        .all()
    )
    return [to_goal_out(r) for r in rows]


@goals_router.get("/{record_id}")
def get_goal(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return to_goal_out(_owned_goal(db, current_user.id, record_id))


@goals_router.patch("/{record_id}")
def update_goal(
    record_id: int,
    data: GoalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = _owned_goal(db, current_user.id, record_id)
    _guard_currency_change(row.current_amount, data.currency, row.currency)
    if data.name is not None:
        row.name = data.name
    if data.target_amount is not None:
        row.target_amount = Decimal(data.target_amount)
    if data.currency is not None:
        row.currency = data.currency
    if data.current_amount is not None:
        row.current_amount = Decimal(data.current_amount)
    if data.deadline is not None:
        row.deadline = data.deadline
    if data.suggested_contribution is not None:
        row.suggested_contribution = Decimal(data.suggested_contribution)
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_goal_out(row)


@goals_router.delete("/{record_id}")
def delete_goal(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    db.delete(_owned_goal(db, current_user.id, record_id))
    db.commit()
    return {"ok": True}
