"""Database engine and session factory (Phase 2).

Reads DATABASE_URL from the local .env. Used by the migration runner,
the seed script, and (from Phase 3 onward) the API.
"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

engine = create_engine(DATABASE_URL) if DATABASE_URL else None
SessionLocal = sessionmaker(bind=engine) if engine is not None else None


def get_database_url() -> str:
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not set")
    return DATABASE_URL
