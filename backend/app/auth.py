"""Authentication helpers (Phase 3).

Argon2 password hashing via pwdlib, JWT session cookies (secure httpOnly),
and the per-user scoping dependency used by all protected endpoints.
"""

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Cookie, Depends, HTTPException, Response, status
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .db import SessionLocal
from .models import User

password_hash = PasswordHash.recommended()

COOKIE_NAME = "mynaira_token"
COOKIE_PATH = "/"


def jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET", "")
    if not secret:
        raise RuntimeError("JWT_SECRET is not set")
    return secret


def jwt_expire_minutes() -> int:
    return int(os.getenv("JWT_EXPIRE_MINUTES", "60"))


def cookie_secure() -> bool:
    return os.getenv("COOKIE_SECURE", "false").lower() == "true"


def hash_password(plain: str) -> str:
    return password_hash.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return password_hash.verify(plain, hashed)
    except Exception:
        return False


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=jwt_expire_minutes()),
    }
    return jwt.encode(payload, jwt_secret(), algorithm="HS256")


def cookie_samesite() -> str:
    # The hosted frontend (Netlify) and API (Render) are cross-site, which
    # requires SameSite=None (browsers drop cross-site Lax cookies, so the
    # session vanishes and the app bounces back to login). SameSite=None is
    # rejected without Secure, so local http keeps lax (same-site anyway).
    return "none" if cookie_secure() else "lax"


def set_session_cookie(response: Response, user_id: int) -> None:
    token = create_access_token(user_id)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=jwt_expire_minutes() * 60,
        expires=jwt_expire_minutes() * 60,
        path=COOKIE_PATH,
        httponly=True,
        samesite=cookie_samesite(),
        secure=cookie_secure(),
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=COOKIE_NAME,
        path=COOKIE_PATH,
        httponly=True,
        samesite=cookie_samesite(),
        secure=cookie_secure(),
    )


def get_db() -> Session:
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not set")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def decode_token(token: str) -> int:
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )


def get_current_user(
    token: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    """Per-user scoping dependency: every protected endpoint depends on this,
    so users can only ever act on their own records (queries filter by
    current_user.id)."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    user_id = decode_token(token)
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return user
