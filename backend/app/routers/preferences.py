"""Alert preferences (Phase 10).

One master record per user (budget_id NULL) with the master switch and
default thresholds; one optional record per budget with independent
thresholds. Effective rule: master switch off silences everything;
otherwise per-budget row wins, falling back to master/default thresholds.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..alerting import DEFAULT_PREFS, evaluate_budget
from ..auth import get_current_user, get_db
from ..models import AlertPreference, Budget, User

router = APIRouter(prefix="/alert-preferences", tags=["alert-preferences"])

THRESHOLD_FIELDS = ("alert_50", "alert_80", "alert_100", "alert_over")


class PrefsIn(BaseModel):
    alert_50: bool | None = None
    alert_80: bool | None = None
    alert_100: bool | None = None
    alert_over: bool | None = None
    alerts_enabled: bool | None = None


def to_prefs_out(row: AlertPreference | None) -> dict:
    base = dict(DEFAULT_PREFS)
    if row is not None:
        base.update(
            {
                "alert_50": row.alert_50,
                "alert_80": row.alert_80,
                "alert_100": row.alert_100,
                "alert_over": row.alert_over,
                "alerts_enabled": row.alerts_enabled,
                "budget_id": row.budget_id,
            }
        )
    else:
        base["budget_id"] = None
    return base


def _master(db: Session, user_id: int) -> AlertPreference | None:
    return (
        db.query(AlertPreference)
        .filter(
            AlertPreference.user_id == user_id,
            AlertPreference.budget_id.is_(None),
        )
        .first()
    )


def _apply(data: PrefsIn, row: AlertPreference) -> None:
    for field in (*THRESHOLD_FIELDS, "alerts_enabled"):
        value = getattr(data, field)
        if value is not None:
            setattr(row, field, value)


@router.get("")
def get_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    rows = (
        db.query(AlertPreference)
        .filter(AlertPreference.user_id == current_user.id)
        .order_by(AlertPreference.budget_id.nullsfirst())
        .all()
    )
    master = next((r for r in rows if r.budget_id is None), None)
    per_budget = [to_prefs_out(r) for r in rows if r.budget_id is not None]
    return {"master": to_prefs_out(master), "budgets": per_budget}


@router.patch("")
def update_master(
    data: PrefsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = _master(db, current_user.id)
    if row is None:
        row = AlertPreference(user_id=current_user.id, budget_id=None)
        db.add(row)
    _apply(data, row)
    db.commit()
    db.refresh(row)
    return {"master": to_prefs_out(row)}


@router.put("/budgets/{budget_id}")
def update_budget_prefs(
    budget_id: int,
    data: PrefsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    budget = (
        db.query(Budget)
        .filter(Budget.id == budget_id, Budget.user_id == current_user.id)
        .first()
    )
    if budget is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found",
        )
    row = (
        db.query(AlertPreference)
        .filter(
            AlertPreference.user_id == current_user.id,
            AlertPreference.budget_id == budget.id,
        )
        .first()
    )
    if row is None:
        row = AlertPreference(user_id=current_user.id, budget_id=budget.id)
        db.add(row)
        db.flush()
    _apply(data, row)
    db.commit()
    db.refresh(row)
    # Changing preferences re-evaluates: an already-reached enabled
    # threshold fires now (dedup still prevents repeats).
    evaluate_budget(db, current_user.id, budget)
    out = to_prefs_out(row)
    out["budget_id"] = budget.id
    return out
