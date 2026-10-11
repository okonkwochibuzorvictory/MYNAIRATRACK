"""Email verification + password-reset token helpers.

Raw tokens are random 32-byte strings sent to the user; only SHA-256
hashes are stored. Tokens expire (verify 24h, reset 1h) and are
single-use. Email delivery is best-effort: if sending is unconfigured
or fails, the request still succeeds and the caller is told delivery
was skipped (local-dev safe, no test suite ever sends real email).
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .email import EmailNotConfigured, send_email
from .models import AuthToken, User

VERIFY_TTL_HOURS = 24
RESET_TTL_HOURS = 1


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def issue_token(db: Session, user: User, purpose: str, ttl_hours: int) -> str:
    raw = secrets.token_urlsafe(32)
    db.add(
        AuthToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            purpose=purpose,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl_hours),
        )
    )
    db.commit()
    return raw


def consume_token(db: Session, raw: str, purpose: str) -> AuthToken | None:
    row = (
        db.query(AuthToken)
        .filter(
            AuthToken.token_hash == hash_token(raw),
            AuthToken.purpose == purpose,
            AuthToken.used_at.is_(None),
            AuthToken.expires_at > datetime.now(timezone.utc),
        )
        .first()
    )
    if row is None:
        return None
    row.used_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()
    return row


def send_email_safe(to: str, subject: str, html: str) -> bool:
    """Returns True if handed to the provider, False if skipped/failed.

    Failures are printed (no secrets) so Render logs show what happened.
    """
    try:
        send_email(to, subject, html)
        return True
    except EmailNotConfigured:
        print("email: skipped (no provider configured)")
        return False
    except Exception as exc:
        print(f"email: failed ({type(exc).__name__}: {exc})")
        return False
