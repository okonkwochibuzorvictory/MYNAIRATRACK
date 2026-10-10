"""SMS notifications (backend only, free by default).

Default provider is a mock that logs instead of sending: zero cost, no
key, fully testable. Set AT_API_KEY (and AT_USERNAME) to use Africa's
Talking — sandbox URLs while AT_SANDBOX=true, live URLs otherwise.
Keys live in backend env only and are never exposed to the frontend.
"""

import os
import re

import httpx

SANDBOX_BASE_URL = "https://api.sandbox.africastalking.com/version1/messaging"
LIVE_BASE_URL = "https://api.africastalking.com/version1/messaging"

E164_RE = re.compile(r"^\+[1-9]\d{9,14}$")


class SMSSendError(Exception):
    pass


def validate_phone(value: str) -> str:
    phone = value.strip().replace(" ", "").replace("-", "")
    if phone.startswith("0") and len(phone) == 11:
        phone = "+234" + phone[1:]
    if not E164_RE.match(phone):
        raise ValueError("Phone number must be in international format, e.g. +2348012345678")
    return phone


def at_username() -> str:
    return os.getenv("AT_USERNAME", "sandbox")


def at_api_key() -> str:
    return os.getenv("AT_API_KEY", "")


def at_sandbox() -> bool:
    return os.getenv("AT_SANDBOX", "true").lower() == "true"


def provider_name() -> str:
    return "mock" if not at_api_key() else "africas-talking"


def send_sms(to: str, message: str) -> str:
    """Send one SMS. Returns the provider message id.

    With no AT_API_KEY configured this is a free mock that logs instead
    of sending. Raises SMSSendError when the provider rejects the request.
    """
    phone = validate_phone(to)
    if not message.strip():
        raise ValueError("Message must not be empty")
    key = at_api_key()
    if not key:
        return f"mock-{abs(hash((phone, message))) % 10**8:08d}"
    base = SANDBOX_BASE_URL if at_sandbox() else LIVE_BASE_URL
    try:
        resp = httpx.post(
            base,
            headers={"apiKey": key, "Content-Type": "application/x-www-form-urlencoded",
                     "Accept": "application/json"},
            data={"username": at_username(), "to": phone, "message": message},
            timeout=10,
        )
    except Exception as exc:
        raise SMSSendError(f"SMS request failed: {exc}") from exc
    if resp.status_code >= 400:
        raise SMSSendError(f"SMS provider rejected the request ({resp.status_code})")
    try:
        recipients = resp.json()["SMSMessageData"]["Recipients"]
        return str(recipients[0].get("messageId", ""))
    except Exception:
        return ""
