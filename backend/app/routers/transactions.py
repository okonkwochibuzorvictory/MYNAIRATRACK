"""Income/expense transactions routes (Phase 6).

MVP types: income and expense only. Each transaction belongs to one
account and preserves its original currency; amounts are never rewritten
by primary-currency changes or FX movements. All access is scoped to the
authenticated user.

Currency on PATCH is never changed silently: omitting it keeps the
original; providing it applies an explicit user-requested change.
"""

from datetime import date as date_cls
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_db
from ..currency import validate_currency
from ..models import Account, Category, Transaction, User

router = APIRouter(prefix="/transactions", tags=["transactions"])

TXN_TYPES = ("income", "expense")


class TransactionCreate(BaseModel):
    account_id: int
    type: str
    amount: str
    currency: str | None = None
    category_id: int | None = None
    date: date_cls | None = None
    payment_method: str | None = None
    note: str | None = None

    @field_validator("type")
    @classmethod
    def type_supported(cls, value: str) -> str:
        if value not in TXN_TYPES:
            raise ValueError("Type must be income or expense")
        return value

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, value: str) -> str:
        try:
            dec = Decimal(value)
        except Exception:
            raise ValueError("Amount must be a valid number")
        if dec <= 0:
            raise ValueError("Amount must be greater than zero")
        return value

    @field_validator("currency")
    @classmethod
    def currency_supported(cls, value: str | None) -> str | None:
        if value is not None:
            return validate_currency(value)
        return value

    @field_validator("payment_method")
    @classmethod
    def payment_method_length(cls, value: str | None) -> str | None:
        if value is not None and len(value.strip()) > 64:
            raise ValueError("Payment method is too long")
        return value.strip() if value is not None and value.strip() else None

    @field_validator("note")
    @classmethod
    def note_length(cls, value: str | None) -> str | None:
        if value is not None and len(value) > 2000:
            raise ValueError("Note is too long")
        return value


class TransactionUpdate(BaseModel):
    account_id: int | None = None
    type: str | None = None
    amount: str | None = None
    currency: str | None = None
    category_id: int | None = None
    date: date_cls | None = None
    payment_method: str | None = None
    note: str | None = None

    @field_validator("type")
    @classmethod
    def type_supported(cls, value: str | None) -> str | None:
        if value is not None and value not in TXN_TYPES:
            raise ValueError("Type must be income or expense")
        return value

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            dec = Decimal(value)
        except Exception:
            raise ValueError("Amount must be a valid number")
        if dec <= 0:
            raise ValueError("Amount must be greater than zero")
        return value

    @field_validator("currency")
    @classmethod
    def currency_supported(cls, value: str | None) -> str | None:
        if value is not None:
            return validate_currency(value)
        return value


def _owned_account(db: Session, user_id: int, account_id: int) -> Account:
    account = (
        db.query(Account)
        .filter(Account.id == account_id, Account.user_id == user_id)
        .first()
    )
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Account must belong to the current user",
        )
    return account


def _checked_category(
    db: Session, user_id: int, txn_type: str, category_id: int | None
) -> Category | None:
    if category_id is None:
        return None
    category = db.query(Category).filter(Category.id == category_id).first()
    if category is None or (
        category.user_id is not None and category.user_id != user_id
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Category must be a default category or your own",
        )
    if category.type != txn_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Category must be an {txn_type} category",
        )
    return category


def to_txn_out(db: Session, txn: Transaction) -> dict:
    account = db.get(Account, txn.account_id)
    category = db.get(Category, txn.category_id) if txn.category_id else None
    return {
        "id": txn.id,
        "account_id": txn.account_id,
        "account_name": account.name if account else None,
        "type": txn.type,
        "amount": str(txn.amount),
        "currency": txn.currency,
        "category_id": txn.category_id,
        "category_name": category.name if category else None,
        "date": txn.date.isoformat(),
        "payment_method": txn.payment_method,
        "note": txn.note,
    }


def get_owned_txn(db: Session, user_id: int, txn_id: int) -> Transaction:
    txn = (
        db.query(Transaction)
        .filter(Transaction.id == txn_id, Transaction.user_id == user_id)
        .first()
    )
    if txn is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found",
        )
    return txn


@router.post("", status_code=status.HTTP_201_CREATED)
def create_transaction(
    data: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    account = _owned_account(db, current_user.id, data.account_id)
    _checked_category(db, current_user.id, data.type, data.category_id)
    txn = Transaction(
        user_id=current_user.id,
        account_id=account.id,
        type=data.type,
        amount=Decimal(data.amount),
        currency=data.currency or account.currency,
        category_id=data.category_id,
        date=data.date or date_cls.today(),
        payment_method=data.payment_method,
        note=data.note.strip() if data.note and data.note.strip() else None,
        is_business=account.is_business,
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return to_txn_out(db, txn)


@router.get("")
def list_transactions(
    type: str | None = Query(default=None),
    account_id: int | None = Query(default=None),
    currency: str | None = Query(default=None),
    date_from: date_cls | None = Query(default=None),
    date_to: date_cls | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    if type is not None and type not in TXN_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Type must be income or expense",
        )
    if currency is not None:
        try:
            validate_currency(currency)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Currency must be one of NGN, USD, EUR, GBP",
            )
    q = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if type is not None:
        q = q.filter(Transaction.type == type)
    if account_id is not None:
        q = q.filter(Transaction.account_id == account_id)
    if currency is not None:
        q = q.filter(Transaction.currency == currency)
    if date_from is not None:
        q = q.filter(Transaction.date >= date_from)
    if date_to is not None:
        q = q.filter(Transaction.date <= date_to)
    rows = q.order_by(Transaction.date.desc(), Transaction.id.desc()).all()
    return [to_txn_out(db, t) for t in rows]


@router.get("/{txn_id}")
def get_transaction(
    txn_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return to_txn_out(db, get_owned_txn(db, current_user.id, txn_id))


@router.patch("/{txn_id}")
def update_transaction(
    txn_id: int,
    data: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    txn = get_owned_txn(db, current_user.id, txn_id)
    new_type = data.type or txn.type
    if data.account_id is not None:
        account = _owned_account(db, current_user.id, data.account_id)
        txn.account_id = account.id
        txn.is_business = account.is_business
    _checked_category(db, current_user.id, new_type, data.category_id)
    if data.type is not None:
        txn.type = data.type
    if data.amount is not None:
        txn.amount = Decimal(data.amount)
    if data.currency is not None:
        txn.currency = data.currency
    if data.category_id is not None:
        txn.category_id = data.category_id
    if data.date is not None:
        txn.date = data.date
    if data.payment_method is not None:
        txn.payment_method = (
            data.payment_method.strip() if data.payment_method.strip() else None
        )
    if data.note is not None:
        txn.note = data.note.strip() if data.note.strip() else None
    db.add(txn)
    db.commit()
    db.refresh(txn)
    return to_txn_out(db, txn)


@router.delete("/{txn_id}")
def delete_transaction(
    txn_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    txn = get_owned_txn(db, current_user.id, txn_id)
    db.delete(txn)
    db.commit()
    return {"ok": True}
