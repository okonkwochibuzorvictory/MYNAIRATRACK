"""SQLAlchemy data model (Phase 2).

Covers every entity in IMPLEMENTATION_PLAN.md section 3, derived from the
finalized PRD. Currency columns reference currencies(code) so the database
itself only accepts the MVP currencies (NGN, USD, EUR, GBP).
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Currency(Base):
    __tablename__ = "currencies"

    code: Mapped[str] = mapped_column(String(3), primary_key=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    symbol: Mapped[str] = mapped_column(String(8), nullable=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    email: Mapped[str] = mapped_column(String(256), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    primary_currency: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"), nullable=False, default="NGN"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ExchangeRate(Base):
    __tablename__ = "exchange_rates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    from_currency: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"), nullable=False
    )
    to_currency: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"), nullable=False
    )
    rate: Mapped[Decimal] = mapped_column(Numeric(18, 8), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("from_currency", "to_currency", name="uq_rate_pair"),
        CheckConstraint("rate > 0", name="ck_rate_positive"),
        CheckConstraint(
            "from_currency <> to_currency", name="ck_rate_distinct_pair"
        ),
    )


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    currency: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"), nullable=False
    )
    is_business: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (
        CheckConstraint("type IN ('income', 'expense')", name="ck_category_type"),
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[int] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"), nullable=False
    )
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="SET NULL"), nullable=True
    )
    date = mapped_column(Date, nullable=False)
    payment_method: Mapped[str | None] = mapped_column(String(64), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_business: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_txn_amount_non_negative"),
        CheckConstraint(
            "type IN ('income', 'expense', 'sale')", name="ck_txn_type"
        ),
    )


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"), nullable=False
    )
    period_start = mapped_column(Date, nullable=False)
    period_end = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_budget_amount_non_negative"),
        CheckConstraint("period_end >= period_start", name="ck_budget_period"),
    )


class BudgetAllocation(Base):
    __tablename__ = "budget_allocations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    budget_id: Mapped[int] = mapped_column(
        ForeignKey("budgets.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    allocated_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "allocated_amount >= 0", name="ck_allocation_non_negative"
        ),
    )


class SavingsTarget(Base):
    __tablename__ = "savings_targets"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    target_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    current_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("target_amount >= 0", name="ck_savings_target_non_negative"),
        CheckConstraint("current_amount >= 0", name="ck_savings_current_non_negative"),
    )


class Goal(Base):
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    target_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    current_amount: Mapped[Decimal] = mapped_column(
        Numeric(18, 2), nullable=False, default=Decimal("0")
    )
    currency: Mapped[str] = mapped_column(
        ForeignKey("currencies.code"), nullable=False
    )
    deadline = mapped_column(Date, nullable=True)
    suggested_contribution: Mapped[Decimal | None] = mapped_column(
        Numeric(18, 2), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint("target_amount >= 0", name="ck_goal_target_non_negative"),
        CheckConstraint("current_amount >= 0", name="ck_goal_current_non_negative"),
    )


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    budget_id: Mapped[int | None] = mapped_column(
        ForeignKey("budgets.id", ondelete="CASCADE"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
