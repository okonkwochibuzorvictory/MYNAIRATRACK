"""Authentication routes (Phase 3).

Register / login / logout / session status. Uses the helpers in
app.auth (Argon2 hashing, JWT httpOnly cookie) and schemas in app.schemas.
"""

import os

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
from ..schemas import ForgotPasswordIn, LoginIn, RegisterIn, ResetPasswordIn, UserOut
from ..tokens import RESET_TTL_HOURS, VERIFY_TTL_HOURS, consume_token, issue_token, send_email_safe

router = APIRouter(prefix="/auth", tags=["auth"])

GENERIC_LOGIN_ERROR = "Invalid email or password"
UNVERIFIED_ERROR = "Please verify your email address before logging in"


def frontend_base() -> str:
    # Strip whitespace: a pasted value with a stray space or newline
    # produces links that email providers refuse to open.
    return os.getenv("FRONTEND_URL", "http://localhost:5173").strip().rstrip("/")


def to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        primary_currency=user.primary_currency,
        is_verified=user.is_verified,
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, response: Response, db: Session = Depends(get_db)) -> dict:
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
    token = issue_token(db, user, "verify", VERIFY_TTL_HOURS)
    emailed = send_email_safe(
        user.email,
        "Verify your MYNAIRATRACK account",
        f"<p>Hi {user.name},</p>"
        "<p>Please verify your email address to finish signing up:</p>"
        f"<p><a href=\"{frontend_base()}/#/verify?token={token}\">Verify my account</a></p>"
        "<p>This link expires in 24 hours.</p>",
    )
    set_session_cookie(response, user.id)
    out = to_user_out(user)
    return {**out.model_dump(), "verification_emailed": emailed}


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, response: Response, db: Session = Depends(get_db)) -> UserOut:
    from fastapi import HTTPException

    user = db.query(User).filter(User.email == data.email).first()
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=GENERIC_LOGIN_ERROR,
        )
    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=UNVERIFIED_ERROR,
        )
    set_session_cookie(response, user.id)
    return to_user_out(user)


@router.post("/logout")
def logout(response: Response) -> dict:
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/verify")
def verify_email(token: str, db: Session = Depends(get_db)) -> dict:
    from fastapi import HTTPException

    row = consume_token(db, token, "verify")
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link",
        )
    user = db.get(User, row.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link",
        )
    user.is_verified = True
    db.add(user)
    db.commit()
    return {"ok": True}


@router.post("/resend-verification")
def resend_verification(
    data: ForgotPasswordIn, db: Session = Depends(get_db)
) -> dict:
    user = db.query(User).filter(User.email == data.email).first()
    emailed = False
    if user is not None and not user.is_verified:
        token = issue_token(db, user, "verify", VERIFY_TTL_HOURS)
        emailed = send_email_safe(
            user.email,
            "Verify your MYNAIRATRACK account",
            f"<p>Hi {user.name},</p>"
            "<p>Please verify your email address:</p>"
            f"<p><a href=\"{frontend_base()}/#/verify?token={token}\">Verify my account</a></p>"
            "<p>This link expires in 24 hours.</p>",
        )
    return {"ok": True, "verification_emailed": emailed}


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordIn, db: Session = Depends(get_db)) -> dict:
    user = db.query(User).filter(User.email == data.email).first()
    emailed = False
    if user is not None:
        token = issue_token(db, user, "reset", RESET_TTL_HOURS)
        emailed = send_email_safe(
            user.email,
            "Reset your MYNAIRATRACK password",
            f"<p>Hi {user.name},</p>"
            "<p>Reset your password with this link (expires in 1 hour):</p>"
            f"<p><a href=\"{frontend_base()}/#/reset-password?token={token}\">Reset my password</a></p>"
            "<p>If you did not ask for this, ignore this email.</p>",
        )
    return {"ok": True, "reset_emailed": emailed}


@router.post("/reset-password")
def reset_password(data: ResetPasswordIn, db: Session = Depends(get_db)) -> dict:
    from fastapi import HTTPException

    row = consume_token(db, data.token, "reset")
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )
    user = db.get(User, row.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link",
        )
    user.password_hash = hash_password(data.password)
    db.add(user)
    db.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> UserOut:
    return to_user_out(current_user)
