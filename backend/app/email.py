"""Transactional email via Resend (backend only).

The API key lives in backend env (RESEND_API_KEY) and is never exposed
to the frontend. When no key is configured, sending is disabled and the
app works normally — callers receive EmailNotConfigured instead of a
network call. Used in future for verification, password-reset, and
opt-in alert emails; nothing sends automatically yet.
"""

import os

import httpx

RESEND_API_URL = "https://api.resend.com/emails"


class EmailNotConfigured(Exception):
    pass


class EmailSendError(Exception):
    pass


def api_key() -> str:
    return os.getenv("RESEND_API_KEY", "")


def sender() -> str:
    return os.getenv("RESEND_FROM", "MYNAIRATRACK <onboarding@resend.dev>")


def is_configured() -> bool:
    return bool(api_key())


def send_email(to: str, subject: str, html: str) -> str:
    """Send one email. Returns the Resend message id.

    Raises EmailNotConfigured when no key is set, EmailSendError when
    Resend rejects the request.
    """
    key = api_key()
    if not key:
        raise EmailNotConfigured("RESEND_API_KEY is not set")
    if not to or "@" not in to:
        raise ValueError("Invalid recipient email address")
    try:
        resp = httpx.post(
            RESEND_API_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={"from": sender(), "to": [to], "subject": subject, "html": html},
            timeout=10,
        )
    except Exception as exc:
        raise EmailSendError(f"Email request failed: {exc}") from exc
    if resp.status_code >= 400:
        raise EmailSendError(f"Resend rejected the request ({resp.status_code})")
    try:
        return str(resp.json().get("id", ""))
    except Exception:
        return ""
