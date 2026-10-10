"""SMS module tests (mock default; provider transport mocked).

Usage: python -m pytest tests/test_sms.py -v  (run from backend/)
"""

import os
from unittest.mock import patch

os.environ.pop("AT_API_KEY", None)

from app import sms as sms_module
from app.sms import provider_name, send_sms, validate_phone, SMSSendError


class FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {
            "SMSMessageData": {"Recipients": [{"messageId": "AT123"}]}}

    def json(self):
        return self._payload


def test_mock_by_default_is_free():
    assert provider_name() == "mock"
    message_id = send_sms("+2348012345678", "Hello")
    assert message_id.startswith("mock-")


def test_phone_validation_and_ng_local_format():
    assert validate_phone("+2348012345678") == "+2348012345678"
    assert validate_phone("08012345678") == "+2348012345678"
    try:
        validate_phone("abc")
        raise AssertionError("should have raised")
    except ValueError:
        pass
    try:
        send_sms("+2348012345678", "   ")
        raise AssertionError("should have raised")
    except ValueError:
        pass


def test_live_provider_mocked(monkeypatch):
    monkeypatch.setenv("AT_API_KEY", "at_test_key")
    assert provider_name() == "africas-talking"
    with patch.object(sms_module.httpx, "post", return_value=FakeResponse()) as mocked:
        assert send_sms("+2348012345678", "Hello") == "AT123"
    _, kwargs = mocked.call_args
    assert kwargs["headers"]["apiKey"] == "at_test_key"
    assert kwargs["data"]["to"] == "+2348012345678"


def test_provider_rejection(monkeypatch):
    monkeypatch.setenv("AT_API_KEY", "at_test_key")
    with patch.object(sms_module.httpx, "post", return_value=FakeResponse(401, {})):
        try:
            send_sms("+2348012345678", "Hello")
            raise AssertionError("should have raised")
        except SMSSendError:
            pass
