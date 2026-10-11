"""Transactional email (backend only).

Two providers, tried in order:
1. Resend (RESEND_API_KEY) — current live path.
2. SMTP fallback (SMTP_USER + SMTP_PASS), e.g. a free Gmail App Password —
   delivers to any address with no custom domain required.

With neither configured, sending is disabled and the app works normally.
Keys/passwords live in backend env only, never in frontend code.
"""

import os
import smtplib
from email.mime.text import MIMEText

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
    return bool(api_key()) or bool(smtp_user() and smtp_password())


def smtp_user() -> str:
    return os.getenv("SMTP_USER", "")


def smtp_password() -> str:
    return os.getenv("SMTP_PASSWORD", "").replace(" ", "").replace("\t", "")


def smtp_from() -> str:
    return os.getenv("SMTP_FROM", "") or smtp_user()


def send_email(to: str, subject: str, html: str) -> str:
    """Send one email. Returns the provider message id (or "smtp-sent").

    Raises EmailNotConfigured when neither provider is set, EmailSendError
    when delivery fails, ValueError for a bad recipient.
    """
    if not to or "@" not in to:
        raise ValueError("Invalid recipient email address")
    key = api_key()
    if key:
        return _send_resend(key, to, subject, html)
    if smtp_user() and smtp_password():
        return _send_smtp(to, subject, html)
    raise EmailNotConfigured("No email provider is configured")


def _send_resend(key: str, to: str, subject: str, html: str) -> str:
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


def _send_smtp(to: str, subject: str, html: str) -> str:
    host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError:
        raise EmailSendError("SMTP_PORT must be a number")
    msg = MIMEText(html, "html", "utf-8")
    msg["Subject"] = subject
    msg["From"] = smtp_from()
    msg["To"] = to
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=20)
        else:
            server = smtplib.SMTP(host, port, timeout=20)
        with server:
            if port != 465:
                server.starttls()
            server.login(smtp_user(), smtp_password())
            server.send_message(msg)
    except Exception as exc:
        raise EmailSendError(f"SMTP delivery failed: {exc}") from exc
    return "smtp-sent"
