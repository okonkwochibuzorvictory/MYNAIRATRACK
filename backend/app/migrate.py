"""Versioned migration runner (Phase 2).

Applies each file in backend/migrations in filename order, recording
applied versions in schema_migrations so re-runs are safe (idempotent).
Usage: python -m app.migrate  (run from the backend/ directory)
"""

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

load_dotenv()

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL", "")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def apply_migrations(database_url: str | None = None) -> list[str]:
    url = database_url or get_database_url()
    applied: list[str] = []
    files = sorted(MIGRATIONS_DIR.glob("*.sql"), key=lambda p: p.name)
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
                )
                """
            )
            cur.execute("SELECT version FROM schema_migrations")
            done = {row[0] for row in cur.fetchall()}
            for path in files:
                version = path.stem
                if version in done:
                    continue
                cur.execute(path.read_text(encoding="utf-8"))
                cur.execute(
                    "INSERT INTO schema_migrations (version) VALUES (%s)",
                    (version,),
                )
                applied.append(version)
        conn.commit()
    return applied


if __name__ == "__main__":
    for version in apply_migrations():
        print(f"applied {version}")
    print("migrations up to date")
