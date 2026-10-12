"""Transactional email (backend only).

Providers tried in order:
1. Resend (RESEND_API_KEY).
2. Brevo (BREVO_API_KEY) — free tier, single-sender verification needs
   no custom domain; delivers to any address.
3. SMTP fallback (SMTP_USER + SMTP_PASS), e.g. a free Gmail App Password.
   (Note: some hosts block outbound SMTP; prefer 1 or 2 there.)

With none configured, sending is disabled and the app works normally.
Keys/passwords live in backend env only, never in frontend code.
"""

import os
import smtplib
from email.mime.text import MIMEText

import httpx

RESEND_API_URL = "https://api.resend.com/emails"
BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


class EmailNotConfigured(Exception):
    pass


class EmailSendError(Exception):
    pass


def api_key() -> str:
    return os.getenv("RESEND_API_KEY", "")


def sender() -> str:
    return os.getenv("RESEND_FROM", "MYNAIRATRACK <onboarding@resend.dev>")


def is_configured() -> bool:
    return bool(api_key()) or bool(brevo_key()) or bool(smtp_user() and smtp_password())


def brevo_key() -> str:
    return os.getenv("BREVO_API_KEY", "")


def brevo_sender() -> str:
    return os.getenv("BREVO_SENDER", "") or smtp_user()


def brevo_sender_name() -> str:
    return os.getenv("BREVO_SENDER_NAME", "MYNAIRATRACK")


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
    if brevo_key():
        return _send_brevo(to, subject, html)
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
    """Direct SMTP (Gmail App Password). Blocked on some free hosts."""
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


def _send_brevo(to: str, subject: str, html: str) -> str:
    try:
        resp = httpx.post(
            BREVO_API_URL,
            headers={"api-key": brevo_key(), "Content-Type": "application/json"},
            json={
                "sender": {"name": brevo_sender_name(), "email": brevo_sender()},
                "to": [{"email": to}],
                "subject": subject,
                "htmlContent": html,
            },
            timeout=10,
        )
    except Exception as exc:
        raise EmailSendError(f"Email request failed: {exc}") from exc
    if resp.status_code >= 400:
        raise EmailSendError(f"Brevo rejected the request ({resp.status_code})")
    try:
        return str(resp.json().get("messageId", ""))
    except Exception:
        return ""
