"""Email helper tests (Resend integration, transport mocked).

Usage: python -m pytest tests/test_email.py -v  (run from backend/)
"""

import os
from unittest.mock import patch

os.environ.pop("RESEND_API_KEY", None)

from app import email as email_module
from app.email import EmailNotConfigured, EmailSendError, is_configured, send_email


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload or {"id": "msg_123"}

    def json(self):
        return self._payload


def test_disabled_without_key():
    assert is_configured() is False
    try:
        send_email("a@example.com", "Hi", "<p>Hi</p>")
        raise AssertionError("should have raised")
    except EmailNotConfigured:
        pass


def test_send_success(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    assert is_configured() is True
    with patch.object(email_module.httpx, "post", return_value=FakeResponse()) as mocked:
        message_id = send_email("a@example.com", "Welcome", "<p>Welcome</p>")
    assert message_id == "msg_123"
    _, kwargs = mocked.call_args
    assert kwargs["headers"]["Authorization"] == "Bearer re_test_key"
    assert kwargs["json"]["to"] == ["a@example.com"]


def test_send_rejection():
    os.environ["RESEND_API_KEY"] = "re_test_key"
    try:
        with patch.object(email_module.httpx, "post", return_value=FakeResponse(401, {})):
            try:
                send_email("a@example.com", "Hi", "<p>Hi</p>")
                raise AssertionError("should have raised")
            except EmailSendError:
                pass
    finally:
        os.environ.pop("RESEND_API_KEY", None)


def test_invalid_recipient(monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    try:
        send_email("not-an-email", "Hi", "<p>Hi</p>")
        raise AssertionError("should have raised")
    except ValueError:
        pass
