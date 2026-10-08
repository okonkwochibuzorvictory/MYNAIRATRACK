"""User setup and settings routes (Phase 3).

Primary currency defaults to NGN at registration (see routers/auth.py).
These endpoints let the user read their profile and change their name
or primary currency to one of the four MVP currencies. Changing the
primary currency affects display only; historical records are never
rewritten (no financial records exist yet in Phase 3).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import get_current_user, get_db
from ..models import User
from ..schemas import UpdateMeIn, UserOut

router = APIRouter(prefix="/users", tags=["users"])


def to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        primary_currency=user.primary_currency,
    )


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return to_user_out(current_user)


@router.patch("/me", response_model=UserOut)
def update_me(
    data: UpdateMeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    user = db.get(User, current_user.id)
    # get_current_user guarantees the row exists; re-fetch in this session.
    assert user is not None
    if data.name is not None:
        user.name = data.name
    if data.primary_currency is not None:
        user.primary_currency = data.primary_currency
    db.add(user)
    db.commit()
    db.refresh(user)
    return to_user_out(user)
