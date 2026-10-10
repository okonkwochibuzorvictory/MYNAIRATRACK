"""Budgets routes (Phase 8).

Each budget has its own currency. An expense counts toward a budget ONLY
when it belongs to the user, falls within the budget period, and matches
the budget currency exactly — never converted, never merged across
currencies. Spending is always computed from transaction records on the
backend; client totals are never trusted.

Currency safety: changing a budget's currency is blocked once the budget
has spending, so historical comparisons are never silently reinterpreted.
Deleting a budget removes only the budget and its allocations.
"""

from datetime import date as date_cls
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_db
from ..currency import validate_currency
from ..models import Budget, BudgetAllocation, Category, Transaction, User

router = APIRouter(prefix="/budgets", tags=["budgets"])


def _status_for(pct: Decimal) -> str:
    if pct >= 100:
        return "Over Budget"
    if pct >= 80:
        return "Near Limit"
    return "On Track"


class AllocationIn(BaseModel):
    category_id: int
    allocated_amount: str

    @field_validator("allocated_amount")
    @classmethod
    def amount_positive(cls, value: str) -> str:
        try:
            dec = Decimal(value)
        except Exception:
            raise ValueError("Allocation amount must be a valid number")
        if dec <= 0:
            raise ValueError("Allocation amount must be greater than zero")
        return value


class BudgetCreate(BaseModel):
    name: str
    amount: str
    currency: str
    period_start: date_cls
    period_end: date_cls
    is_business: bool = False
    allocations: list[AllocationIn] = []

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Budget name is required")
        if len(value.strip()) > 128:
            raise ValueError("Budget name is too long")
        return value.strip()

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, value: str) -> str:
        try:
            dec = Decimal(value)
        except Exception:
            raise ValueError("Budget amount must be a valid number")
        if dec <= 0:
            raise ValueError("Budget amount must be greater than zero")
        return value

    @field_validator("currency")
    @classmethod
    def currency_supported(cls, value: str) -> str:
        return validate_currency(value)


class BudgetUpdate(BaseModel):
    name: str | None = None
    amount: str | None = None
    currency: str | None = None
    period_start: date_cls | None = None
    period_end: date_cls | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Budget name is required")
        if value is not None and len(value.strip()) > 128:
            raise ValueError("Budget name is too long")
        return value.strip() if value is not None else None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            dec = Decimal(value)
        except Exception:
            raise ValueError("Budget amount must be a valid number")
        if dec <= 0:
            raise ValueError("Budget amount must be greater than zero")
        return value

    @field_validator("currency")
    @classmethod
    def currency_supported(cls, value: str | None) -> str | None:
        if value is not None:
            return validate_currency(value)
        return value


def _owned_budget(db: Session, user_id: int, budget_id: int) -> Budget:
    budget = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.user_id == user_id)
        .first()
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found",
        )
    return budget


def _require_business_mode(db: Session, current_user: User) -> None:
    fresh = db.get(User, current_user.id)
    if fresh is None or not fresh.business_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Business Mode is not activated",
        )


def _gated_budget(db: Session, current_user: User, budget_id: int) -> Budget:
    budget = _owned_budget(db, current_user.id, budget_id)
    if budget.is_business:
        _require_business_mode(db, current_user)
    return budget


def _checked_expense_category(
    db: Session, user_id: int, category_id: int
) -> Category:
    category = db.query(Category).filter(Category.id == category_id).first()
    if category is None or (
        category.user_id is not None and category.user_id != user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Category must be a default category or your own",
        )
    if category.type != "expense":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Budget allocations must use expense categories",
        )
    return category


def _matching_expenses(db: Session, user_id: int, budget: Budget):
    return (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == "expense",
            Transaction.is_business.is_(budget.is_business),
            Transaction.currency == budget.currency,
            Transaction.date >= budget.period_start,
            Transaction.date <= budget.period_end,
        )
        .all()
    )


def _monitoring(db: Session, user_id: int, budget: Budget) -> dict:
    expenses = _matching_expenses(db, user_id, budget)
    by_category: dict[int | None, Decimal] = {}
    for t in expenses:
        by_category[t.category_id] = by_category.get(t.category_id, Decimal("0")) + t.amount
    total_spent = sum(by_category.values(), Decimal("0"))

    allocations = (
        db.query(BudgetAllocation)
        .filter(BudgetAllocation.budget_id == budget.id)
        .order_by(BudgetAllocation.id)
        .all()
    )
    alloc_rows = []
    allocated_total = Decimal("0")
    allocated_spent = Decimal("0")
    for a in allocations:
        category = db.get(Category, a.category_id)
        spent = by_category.get(a.category_id, Decimal("0"))
        pct = (
            (spent / a.allocated_amount * 100)
            if a.allocated_amount > 0
            else Decimal("0")
        )
        allocated_total += a.allocated_amount
        allocated_spent += spent
        alloc_rows.append(
            {
                "id": a.id,
                "category_id": a.category_id,
                "category_name": category.name if category else None,
                "allocated_amount": str(a.allocated_amount),
                "spent": str(spent),
                "remaining": str(a.allocated_amount - spent),
                "percent_used": float(pct),
                "status": _status_for(pct),
            }
        )

    unallocated_spending = total_spent - allocated_spent
    overall_pct = (
        (total_spent / budget.amount * 100) if budget.amount > 0 else Decimal("0")
    )
    return {
        "total_allocated": str(allocated_total),
        "total_spent": str(total_spent),
        "remaining": str(budget.amount - total_spent),
        "percent_used": float(overall_pct),
        "status": _status_for(overall_pct),
        "unallocated_spending": str(unallocated_spending),
        "allocations": alloc_rows,
    }


def to_budget_out(db: Session, user_id: int, budget: Budget, detailed: bool) -> dict:
    payload: dict = {
        "id": budget.id,
        "name": budget.name,
        "amount": str(budget.amount),
        "currency": budget.currency,
        "period_start": budget.period_start.isoformat(),
        "period_end": budget.period_end.isoformat(),
        "is_business": budget.is_business,
    }
    monitoring = _monitoring(db, user_id, budget)
    payload.update(monitoring if detailed else {k: monitoring[k] for k in (
        "total_spent", "remaining", "percent_used", "status")})
    return payload


def _validate_allocations(
    db: Session, user_id: int, amount: Decimal, allocations: list[AllocationIn]
) -> Decimal:
    seen: set[int] = set()
    total = Decimal("0")
    for item in allocations:
        _checked_expense_category(db, user_id, item.category_id)
        if item.category_id in seen:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Duplicate category in allocations",
            )
        seen.add(item.category_id)
        total += Decimal(item.allocated_amount)
    if total > amount:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Allocations exceed the budget amount",
        )
    return total


@router.post("", status_code=status.HTTP_201_CREATED)
def create_budget(
    data: BudgetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if data.period_end < data.period_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="End date cannot be before start date",
        )
    amount = Decimal(data.amount)
    _validate_allocations(db, current_user.id, amount, data.allocations)
    budget = Budget(
        user_id=current_user.id,
        name=data.name,
        amount=amount,
        currency=data.currency,
        period_start=data.period_start,
        period_end=data.period_end,
        is_business=data.is_business,
    )
    db.add(budget)
    db.flush()
    for item in data.allocations:
        db.add(
            BudgetAllocation(
                budget_id=budget.id,
                category_id=item.category_id,
                allocated_amount=Decimal(item.allocated_amount),
            )
        )
    db.commit()
    db.refresh(budget)
    return to_budget_out(db, current_user.id, budget, detailed=True)


@router.get("")
def list_budgets(
    business: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    q = db.query(Budget).filter(Budget.user_id == current_user.id)
    if business is True:
        _require_business_mode(db, current_user)
        q = q.filter(Budget.is_business.is_(True))
    else:
        q = q.filter(Budget.is_business.is_(False))
    budgets = q.order_by(Budget.id).all()
    return [to_budget_out(db, current_user.id, b, detailed=False) for b in budgets]


@router.get("/{budget_id}")
def get_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return to_budget_out(
        db, current_user.id, _gated_budget(db, current_user, budget_id), detailed=True
    )


@router.patch("/{budget_id}")
def update_budget(
    budget_id: int,
    data: BudgetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    budget = _gated_budget(db, current_user, budget_id)
    new_start = data.period_start or budget.period_start
    new_end = data.period_end or budget.period_end
    if new_end < new_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="End date cannot be before start date",
        )
    new_amount = Decimal(data.amount) if data.amount is not None else budget.amount
    if data.currency is not None and data.currency != budget.currency:
        if _matching_expenses(db, current_user.id, budget):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Budget currency cannot be changed once it has spending",
            )
        budget.currency = data.currency
    if data.name is not None:
        budget.name = data.name
    if data.amount is not None:
        allocated = sum(
            (a.allocated_amount for a in db.query(BudgetAllocation).filter(
                BudgetAllocation.budget_id == budget.id).all()),
            Decimal("0"),
        )
        if allocated > new_amount:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Budget amount cannot be less than allocated total",
            )
        budget.amount = new_amount
    budget.period_start = new_start
    budget.period_end = new_end
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return to_budget_out(db, current_user.id, budget, detailed=True)


@router.delete("/{budget_id}")
def delete_budget(
    budget_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    budget = _gated_budget(db, current_user, budget_id)
    db.delete(budget)
    db.commit()
    return {"ok": True}


@router.post("/{budget_id}/allocations", status_code=status.HTTP_201_CREATED)
def add_allocation(
    budget_id: int,
    data: AllocationIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    budget = _gated_budget(db, current_user, budget_id)
    _checked_expense_category(db, current_user.id, data.category_id)
    existing = (
        db.query(BudgetAllocation)
        .filter(
            BudgetAllocation.budget_id == budget.id,
            BudgetAllocation.category_id == data.category_id,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Category is already allocated in this budget",
        )
    allocated = sum(
        (a.allocated_amount for a in db.query(BudgetAllocation).filter(
            BudgetAllocation.budget_id == budget.id).all()),
        Decimal("0"),
    )
    if allocated + Decimal(data.allocated_amount) > budget.amount:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Allocations exceed the budget amount",
        )
    row = BudgetAllocation(
        budget_id=budget.id,
        category_id=data.category_id,
        allocated_amount=Decimal(data.allocated_amount),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    category = db.get(Category, row.category_id)
    return {
        "id": row.id,
        "category_id": row.category_id,
        "category_name": category.name if category else None,
        "allocated_amount": str(row.allocated_amount),
    }


@router.patch("/{budget_id}/allocations/{allocation_id}")
def update_allocation(
    budget_id: int,
    allocation_id: int,
    data: AllocationIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    budget = _gated_budget(db, current_user, budget_id)
    row = (
        db.query(BudgetAllocation)
        .filter(
            BudgetAllocation.id == allocation_id,
            BudgetAllocation.budget_id == budget.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Allocation not found",
        )
    _checked_expense_category(db, current_user.id, data.category_id)
    clash = (
        db.query(BudgetAllocation)
        .filter(
            BudgetAllocation.budget_id == budget.id,
            BudgetAllocation.category_id == data.category_id,
            BudgetAllocation.id != row.id,
        )
        .first()
    )
    if clash is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Category is already allocated in this budget",
        )
    others = sum(
        (a.allocated_amount for a in db.query(BudgetAllocation).filter(
            BudgetAllocation.budget_id == budget.id,
            BudgetAllocation.id != row.id).all()),
        Decimal("0"),
    )
    if others + Decimal(data.allocated_amount) > budget.amount:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Allocations exceed the budget amount",
        )
    row.category_id = data.category_id
    row.allocated_amount = Decimal(data.allocated_amount)
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_budget_out(db, current_user.id, budget, detailed=True)


@router.delete("/{budget_id}/allocations/{allocation_id}")
def delete_allocation(
    budget_id: int,
    allocation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    budget = _gated_budget(db, current_user, budget_id)
    row = (
        db.query(BudgetAllocation)
        .filter(
            BudgetAllocation.id == allocation_id,
            BudgetAllocation.budget_id == budget.id,
        )
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Allocation not found",
        )
    db.delete(row)
    db.commit()
    return {"ok": True}
