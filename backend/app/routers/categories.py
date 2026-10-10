"""Categories management (Phase 7).

GET list is the Phase 6 read-only contract (defaults + caller's own).
Management rules:
- Custom categories belong to the authenticated user (is_default=False).
- Default/system categories are read-only: edit/delete -> 403.
- Another user's custom categories are invisible: access -> 404 (no leak).
- Deleting a category referenced by transactions -> 409; history is
  never deleted or silently reassigned.
- Names are unique per (owner scope, type), case-insensitive, so the
  merged default + custom list never shows two identical choices.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_db
from ..models import Category, Transaction, User

router = APIRouter(prefix="/categories", tags=["categories"])

CATEGORY_TYPES = ("income", "expense")


class CategoryCreate(BaseModel):
    name: str
    type: str
    is_business: bool = False

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Category name is required")
        if len(value.strip()) > 128:
            raise ValueError("Category name is too long")
        return value.strip()

    @field_validator("type")
    @classmethod
    def type_supported(cls, value: str) -> str:
        if value not in CATEGORY_TYPES:
            raise ValueError("Type must be income or expense")
        return value


class CategoryUpdate(BaseModel):
    name: str | None = None
    type: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Category name is required")
        if value is not None and len(value.strip()) > 128:
            raise ValueError("Category name is too long")
        return value.strip() if value is not None else None


def to_category_out(row: Category) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "type": row.type,
        "is_default": row.is_default,
        "is_business": row.is_business,
    }


def _duplicate_exists(
    db: Session, user_id: int, name: str, type: str, exclude_id: int | None = None
) -> bool:
    q = db.query(Category).filter(
        func.lower(Category.name) == name.lower(),
        Category.type == type,
        ((Category.user_id.is_(None)) | (Category.user_id == user_id)),
    )
    if exclude_id is not None:
        q = q.filter(Category.id != exclude_id)
    return q.first() is not None


def _visible_category(db: Session, user_id: int, category_id: int) -> Category:
    row = (
        db.query(Category)
        .filter(
            Category.id == category_id,
            ((Category.user_id.is_(None)) | (Category.user_id == user_id)),
        )
        .first()
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found",
        )
    return row


def _owned_custom_category(db: Session, user_id: int, category_id: int) -> Category:
    row = _visible_category(db, user_id, category_id)
    if row.is_default or row.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Default categories cannot be modified",
        )
    return row


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
        {"id": r.id, "name": r.name, "type": r.type, "is_default": r.is_default,
         "is_business": r.is_business}
        for r in rows
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_category(
    data: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if _duplicate_exists(db, current_user.id, data.name, data.type):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A category with this name already exists",
        )
    row = Category(
        user_id=current_user.id,
        name=data.name,
        type=data.type,
        is_default=False,
        is_business=data.is_business,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_category_out(row)


@router.get("/{category_id}")
def get_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return to_category_out(_visible_category(db, current_user.id, category_id))


@router.patch("/{category_id}")
def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = _owned_custom_category(db, current_user.id, category_id)
    if data.type is not None and data.type not in CATEGORY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Type must be income or expense",
        )
    if data.type is not None and data.type != row.type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Category type cannot be changed after creation",
        )
    if data.name is not None:
        if _duplicate_exists(
            db, current_user.id, data.name, row.type, exclude_id=row.id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A category with this name already exists",
            )
        row.name = data.name
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_category_out(row)


@router.delete("/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    row = _owned_custom_category(db, current_user.id, category_id)
    usage = (
        db.query(Transaction).filter(Transaction.category_id == row.id).count()
    )
    if usage > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Category is used by {usage} transaction"
                f"{'s' if usage != 1 else ''} and cannot be deleted"
            ),
        )
    db.delete(row)
    db.commit()
    return {"ok": True}
