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


def test_smtp_fallback_when_no_resend_key(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("SMTP_USER", "me@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password")
    sent = {}

    class FakeSMTP:
        def __init__(self, *args, **kwargs):
            pass

        def starttls(self):
            pass

        def login(self, user, password):
            sent["login"] = (user, password)

        def send_message(self, msg):
            sent["to"] = msg["To"]
            sent["subject"] = msg["Subject"]

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    with patch("app.email.smtplib.SMTP", FakeSMTP):
        assert send_email("a@example.com", "Hi", "<p>Hi</p>") == "smtp-sent"
    assert sent["login"] == ("me@gmail.com", "app-password")
    assert sent["to"] == "a@example.com"


def test_smtp_strips_spaces_from_app_password(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("SMTP_USER", "me@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "abcd efgh ijkl mnop")
    seen = {}

    class FakeSMTP:
        def __init__(self, *args, **kwargs):
            pass

        def starttls(self):
            pass

        def login(self, user, password):
            seen["password"] = password

        def send_message(self, msg):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    with patch("app.email.smtplib.SMTP", FakeSMTP):
        send_email("a@example.com", "Hi", "<p>Hi</p>")
    assert seen["password"] == "abcdefghijklmnop"


def test_smtp_unicode_body(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("SMTP_USER", "me@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "x")
    bodies = {}

    class FakeSMTP:
        def __init__(self, *args, **kwargs):
            pass

        def starttls(self):
            pass

        def login(self, user, password):
            pass

        def send_message(self, msg):
            bodies["payload"] = msg.as_string()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    with patch("app.email.smtplib.SMTP", FakeSMTP):
        assert send_email("a@example.com", "Hi ₦", "<p>Hi Chibuzor 👋</p>") == "smtp-sent"
    assert bodies["payload"]


def test_smtp_failure(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("SMTP_USER", "me@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "app-password")

    class BadSMTP:
        def __init__(self, *args, **kwargs):
            raise ConnectionError("down")

    with patch("app.email.smtplib.SMTP", BadSMTP):
        try:
            send_email("a@example.com", "Hi", "<p>Hi</p>")
            raise AssertionError("should have raised")
        except EmailSendError:
            pass


def _brevo_env(monkeypatch):
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("SMTP_USER", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.setenv("BREVO_API_KEY", "xkeysib-test")
    monkeypatch.setenv("BREVO_SENDER", "me@gmail.com")


def test_brevo_preferred_over_smtp(monkeypatch):
    _brevo_env(monkeypatch)
    monkeypatch.setenv("SMTP_USER", "me@gmail.com")
    monkeypatch.setenv("SMTP_PASSWORD", "x")

    class ExplodingSMTP:
        def __init__(self, *args, **kwargs):
            raise AssertionError("SMTP must not be used when Brevo is set")

    with patch("app.email.smtplib.SMTP", ExplodingSMTP):
        with patch.object(email_module.httpx, "post",
                          return_value=FakeResponse(201, {"messageId": "brevo-1"})) as mocked:
            assert send_email("a@example.com", "Hi", "<p>Hi</p>") == "brevo-1"
    _, kwargs = mocked.call_args
    assert kwargs["headers"]["api-key"] == "xkeysib-test"
    assert kwargs["json"]["to"] == [{"email": "a@example.com"}]
    assert kwargs["json"]["sender"] == {"name": "MYNAIRATRACK", "email": "me@gmail.com"}


def test_brevo_custom_sender_name(monkeypatch):
    _brevo_env(monkeypatch)
    monkeypatch.setenv("BREVO_SENDER_NAME", "My Brand")
    with patch.object(email_module.httpx, "post",
                      return_value=FakeResponse(201, {"messageId": "brevo-2"})) as mocked:
        assert send_email("a@example.com", "Hi", "<p>Hi</p>") == "brevo-2"
    _, kwargs = mocked.call_args
    assert kwargs["json"]["sender"] == {"name": "My Brand", "email": "me@gmail.com"}


def test_brevo_rejection(monkeypatch):
    _brevo_env(monkeypatch)
    with patch.object(email_module.httpx, "post", return_value=FakeResponse(401, {})):
        try:
            send_email("a@example.com", "Hi", "<p>Hi</p>")
            raise AssertionError("should have raised")
        except EmailSendError:
            pass
