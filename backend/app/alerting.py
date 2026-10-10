"""Budget alert evaluation (Phase 10).

An alert fires when a budget's same-currency, in-period spending reaches
or crosses an enabled threshold (50/80/100/over-budget). Dedup key is
(budget, threshold, budget period) stored in dedicated columns: once
fired, the same threshold never fires again in that period, even if
spending dips and re-crosses. Existing alerts are historical records —
recalculation never rewrites or deletes them. Alerting never moves money
or edits balances.
"""

from decimal import Decimal

from sqlalchemy.orm import Session

from .models import Alert, AlertPreference, Budget, Transaction

THRESHOLDS = (50, 80, 100)

DEFAULT_PREFS = {
    "alert_50": False,
    "alert_80": True,
    "alert_100": True,
    "alert_over": True,
    "alerts_enabled": True,
}


def budget_spent(db: Session, user_id: int, budget: Budget) -> Decimal:
    rows = (
        db.query(Transaction.amount)
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
    return sum((r[0] for r in rows), Decimal("0"))


def budget_percent(spent: Decimal, amount: Decimal) -> Decimal:
    if amount <= 0:
        return Decimal("0")
    return spent / amount * 100


def effective_prefs(
    db: Session, user_id: int, budget_id: int
) -> dict[str, bool]:
    master = (
        db.query(AlertPreference)
        .filter(
            AlertPreference.user_id == user_id,
            AlertPreference.budget_id.is_(None),
        )
        .first()
    )
    base = dict(DEFAULT_PREFS)
    if master is not None:
        base = {
            "alert_50": master.alert_50,
            "alert_80": master.alert_80,
            "alert_100": master.alert_100,
            "alert_over": master.alert_over,
            "alerts_enabled": master.alerts_enabled,
        }
    if not base["alerts_enabled"]:
        return {**base, "alerts_enabled": False}
    row = (
        db.query(AlertPreference)
        .filter(
            AlertPreference.user_id == user_id,
            AlertPreference.budget_id == budget_id,
        )
        .first()
    )
    if row is not None:
        base.update(
            {
                "alert_50": row.alert_50,
                "alert_80": row.alert_80,
                "alert_100": row.alert_100,
                "alert_over": row.alert_over,
            }
        )
    return base


def _already_fired(
    db: Session, user_id: int, budget: Budget, threshold: str
) -> bool:
    return (
        db.query(Alert)
        .filter(
            Alert.user_id == user_id,
            Alert.budget_id == budget.id,
            Alert.type == f"threshold_{threshold}",
            Alert.period_start == budget.period_start,
            Alert.period_end == budget.period_end,
        )
        .first()
        is not None
    )


def _fire(
    db: Session, user_id: int, budget: Budget, threshold: str,
    pct: Decimal, spent: Decimal,
) -> Alert:
    if threshold == "over":
        text = (
            f"{budget.name} is over budget "
            f"({spent} of {budget.amount} {budget.currency}, "
            f"{pct:.1f}% used)"
        )
    else:
        text = (
            f"{budget.name} reached {threshold}% of budget "
            f"({spent} of {budget.amount} {budget.currency})"
        )
    alert = Alert(
        user_id=user_id,
        budget_id=budget.id,
        type=f"threshold_{threshold}",
        message=text,
        period_start=budget.period_start,
        period_end=budget.period_end,
    )
    db.add(alert)
    return alert


def evaluate_budget(db: Session, user_id: int, budget: Budget) -> list[Alert]:
    """Fire newly-crossed enabled thresholds. Returns created alerts."""
    prefs = effective_prefs(db, user_id, budget.id)
    if not prefs["alerts_enabled"]:
        return []
    spent = budget_spent(db, user_id, budget)
    pct = budget_percent(spent, budget.amount)
    created: list[Alert] = []
    for level in THRESHOLDS:
        if pct >= level and prefs[f"alert_{level}"] and not _already_fired(
            db, user_id, budget, str(level)
        ):
            created.append(_fire(db, user_id, budget, str(level), pct, spent))
    if pct > 100 and prefs["alert_over"] and not _already_fired(
        db, user_id, budget, "over"
    ):
        created.append(_fire(db, user_id, budget, "over", pct, spent))
    if created:
        db.commit()
        for alert in created:
            db.refresh(alert)
    return created


def evaluate_user_budgets(db: Session, user_id: int) -> list[Alert]:
    budgets = db.query(Budget).filter(Budget.user_id == user_id).all()
    created: list[Alert] = []
    for budget in budgets:
        created.extend(evaluate_budget(db, user_id, budget))
    return created
