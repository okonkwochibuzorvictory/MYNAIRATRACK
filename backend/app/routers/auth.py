"""Authentication routes (Phase 3).

Register / login / logout / session status. Uses the helpers in
app.auth (Argon2 hashing, JWT httpOnly cookie) and schemas in app.schemas.
"""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from ..auth import (
    clear_session_cookie,
    get_current_user,
    get_db,
    hash_password,
    set_session_cookie,
    verify_password,
)
from ..models import User
from ..schemas import LoginIn, RegisterIn, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

GENERIC_LOGIN_ERROR = "Invalid email or password"


def to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        primary_currency=user.primary_currency,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, response: Response, db: Session = Depends(get_db)) -> UserOut:
    existing = db.query(User).filter(User.email == data.email).first()
    if existing is not None:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        primary_currency="NGN",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    set_session_cookie(response, user.id)
    return to_user_out(user)


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, response: Response, db: Session = Depends(get_db)) -> UserOut:
    from fastapi import HTTPException

    user = db.query(User).filter(User.email == data.email).first()
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_LOGIN_ERROR,
        )
    set_session_cookie(response, user.id)
    return to_user_out(user)


@router.post("/logout")
def logout(response: Response) -> dict:
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return to_user_out(current_user)
