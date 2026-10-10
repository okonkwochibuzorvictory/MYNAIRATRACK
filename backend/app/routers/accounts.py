"""Accounts/wallets routes (Phase 5).

Each account holds exactly one currency, immutable after creation.
The native balance is the opening balance plus same-currency
transactions only (income/sale add, expenses subtract); cross-currency
amounts are never merged. All access is scoped to the authenticated user.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_db
from ..currency import validate_currency
from ..models import Account, Transaction, User

router = APIRouter(prefix="/accounts", tags=["accounts"])

ACCOUNT_TYPES = ("Bank Account", "Cash", "Mobile Money", "Savings", "Other")


class AccountCreate(BaseModel):
    name: str
    currency: str
    account_type: str = "Other"
    is_business: bool = False
    opening_balance: Decimal = Decimal("0")

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Account name is required")
        if len(value.strip()) > 128:
            raise ValueError("Account name is too long")
        return value.strip()

    @field_validator("currency")
    @classmethod
    def currency_supported(cls, value: str) -> str:
        return validate_currency(value)

    @field_validator("account_type")
    @classmethod
    def type_supported(cls, value: str) -> str:
        if value not in ACCOUNT_TYPES:
            raise ValueError(f"Account type must be one of {', '.join(ACCOUNT_TYPES)}")
        return value

    @field_validator("opening_balance")
    @classmethod
    def balance_non_negative(cls, value: Decimal) -> Decimal:
        if value < 0:
            raise ValueError("Opening balance must be non-negative")
        return value


class AccountUpdate(BaseModel):
    name: str | None = None
    account_type: str | None = None
    is_business: bool | None = None
    opening_balance: Decimal | None = None
    currency: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Account name is required")
        if value is not None and len(value.strip()) > 128:
            raise ValueError("Account name is too long")
        return value.strip() if value is not None else None

    @field_validator("account_type")
    @classmethod
    def type_supported(cls, value: str | None) -> str | None:
        if value is not None and value not in ACCOUNT_TYPES:
            raise ValueError(f"Account type must be one of {', '.join(ACCOUNT_TYPES)}")
        return value

    @field_validator("opening_balance")
    @classmethod
    def balance_non_negative(cls, value: Decimal | None) -> Decimal | None:
        if value is not None and value < 0:
            raise ValueError("Opening balance must be non-negative")
        return value


def native_balance(db: Session, account: Account) -> Decimal:
    """Opening balance plus same-currency transactions only."""
    total = account.opening_balance
    rows = (
        db.query(Transaction.type, Transaction.amount)
        .filter(
            Transaction.account_id == account.id,
            Transaction.currency == account.currency,
        )
        .all()
    )
    for txn_type, amount in rows:
        if txn_type in ("income", "sale"):
            total += amount
        else:
            total -= amount
    return total


def to_account_out(db: Session, account: Account) -> dict:
    return {
        "id": account.id,
        "name": account.name,
        "currency": account.currency,
        "account_type": account.account_type,
        "is_business": account.is_business,
        "opening_balance": str(account.opening_balance),
        "balance": str(native_balance(db, account)),
    }


def _require_business_mode(db: Session, current_user: User) -> None:
    fresh = db.get(User, current_user.id)
    if fresh is None or not fresh.business_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Business Mode is not activated",
        )


def get_owned_account(db: Session, user_id: int, account_id: int) -> Account:
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == user_id)
        .first()
    )
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found",
        )
    return account


@router.post("", status_code=status.HTTP_201_CREATED)
def create_account(
    data: AccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    account = Account(
        user_id=current_user.id,
        name=data.name,
        currency=data.currency,
        account_type=data.account_type,
        is_business=data.is_business,
        opening_balance=data.opening_balance,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return to_account_out(db, account)


@router.get("")
def list_accounts(
    business: bool | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    q = db.query(Account).filter(Account.user_id == current_user.id)
    if business is True:
        _require_business_mode(db, current_user)
        q = q.filter(Account.is_business.is_(True))
    else:
        q = q.filter(Account.is_business.is_(False))
    accounts = q.order_by(Account.id).all()
    return [to_account_out(db, a) for a in accounts]


@router.get("/{account_id}")
def get_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    account = get_owned_account(db, current_user.id, account_id)
    if account.is_business:
        _require_business_mode(db, current_user)
    return to_account_out(db, account)


@router.patch("/{account_id}")
def update_account(
    account_id: int,
    data: AccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    account = get_owned_account(db, current_user.id, account_id)
    if account.is_business:
        _require_business_mode(db, current_user)
    if data.currency is not None and data.currency != account.currency:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Account currency cannot be changed after creation",
        )
    if data.name is not None:
        account.name = data.name
    if data.account_type is not None:
        account.account_type = data.account_type
    if data.is_business is not None:
        account.is_business = data.is_business
    if data.opening_balance is not None:
        account.opening_balance = data.opening_balance
    db.add(account)
    db.commit()
    db.refresh(account)
    return to_account_out(db, account)


@router.delete("/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    account = get_owned_account(db, current_user.id, account_id)
    if account.is_business:
        _require_business_mode(db, current_user)
    txn_count = (
        db.query(Transaction).filter(Transaction.account_id == account.id).count()
    )
    if txn_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Account has transactions and cannot be deleted",
        )
    db.delete(account)
    db.commit()
    return {"ok": True}
