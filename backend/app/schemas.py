"""Pydantic schemas for authentication and user setup (Phase 3)."""

import re

from pydantic import BaseModel, field_validator

MVP_CURRENCIES = ("NGN", "USD", "EUR", "GBP")

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def validate_email(value: str) -> str:
    email = value.strip().lower()
    if not EMAIL_RE.match(email):
        raise ValueError("Invalid email address")
    return email


def validate_password(value: str) -> str:
    if len(value) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"[0-9]", value):
        raise ValueError("Password must contain at least one letter and one number")
    return value


class RegisterIn(BaseModel):
    name: str
    email: str
    password: str

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()

    @field_validator("email")
    @classmethod
    def email_valid(cls, value: str) -> str:
        return validate_email(value)

    @field_validator("password")
    @classmethod
    def password_valid(cls, value: str) -> str:
        return validate_password(value)


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_valid(cls, value: str) -> str:
        return validate_email(value)


class UpdateMeIn(BaseModel):
    name: str | None = None
    primary_currency: str | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Name is required")
        return value.strip() if value is not None else None

    @field_validator("primary_currency")
    @classmethod
    def currency_supported(cls, value: str | None) -> str | None:
        if value is not None and value not in MVP_CURRENCIES:
            raise ValueError(f"Currency must be one of {', '.join(MVP_CURRENCIES)}")
        return value


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    primary_currency: str
