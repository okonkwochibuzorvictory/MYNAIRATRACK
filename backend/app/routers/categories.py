"""Categories read-only list (Phase 6 support).

Full category management (create/edit/delete custom categories) belongs
to Phase 7. This endpoint only lists the seeded defaults plus the
caller's own custom categories so transaction forms can offer valid,
type-compatible choices.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_db
from ..models import Category, User

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("")
def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    rows = (
        db.query(Category)
        .filter(
            (Category.user_id.is_(None)) | (Category.user_id == current_user.id)
        )
        .order_by(Category.type, Category.name)
        .all()
    )
    return [
        {"id": r.id, "name": r.name, "type": r.type, "is_default": r.is_default}
        for r in rows
    ]
