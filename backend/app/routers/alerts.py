"""In-app budget alerts (Phase 10).

Alerts are historical records created by threshold evaluation —
in-app only, never email or push. Reading an alert never changes
spending data.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_db
from ..models import Alert, Budget, User

router = APIRouter(prefix="/alerts", tags=["alerts"])


def to_alert_out(db: Session, alert: Alert) -> dict:
    budget = db.get(Budget, alert.budget_id) if alert.budget_id else None
    created = alert.created_at
    return {
        "id": alert.id,
        "budget_id": alert.budget_id,
        "budget_name": budget.name if budget else None,
        "type": alert.type,
        "message": alert.message,
        "is_read": alert.is_read,
        "created_at": created.isoformat() if created else None,
    }


@router.get("")
def list_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    rows = (
        db.query(Alert)
        .filter(Alert.user_id == current_user.id)
        .order_by(Alert.is_read.asc(), desc(Alert.id))
        .all()
    )
    return [to_alert_out(db, a) for a in rows]


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    count = (
        db.query(Alert)
        .filter(Alert.user_id == current_user.id, Alert.is_read.is_(False))
        .count()
    )
    return {"unread": count}


@router.patch("/{alert_id}/read")
def mark_read(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    alert = (
        db.query(Alert)
        .filter(Alert.id == alert_id, Alert.user_id == current_user.id)
        .first()
    )
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )
    alert.is_read = True
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return to_alert_out(db, alert)
