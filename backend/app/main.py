"""MYNAIRATRACK backend — Phase 5: accounts/wallets.

Provides /health and /db-check (Phase 1), /auth/* and /users/me
(Phase 3), /currencies and /exchange-rates/* (Phase 4), plus
/accounts/* (Phase 5). No transactions yet; balances are native
per-account (opening balance, same-currency only).
"""

import os

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from .routers import accounts as accounts_router
from .routers import auth as auth_router
from .routers import categories as categories_router
from .routers import currencies as currencies_router
from .routers import exchange_rates as exchange_rates_router
from .routers import transactions as transactions_router
from .routers import users as users_router

app = FastAPI(title="MYNAIRATRACK API (Phase 6)")

cors_origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(users_router.router)
app.include_router(currencies_router.router)
app.include_router(exchange_rates_router.router)
app.include_router(accounts_router.router)
app.include_router(transactions_router.router)
app.include_router(categories_router.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "phase": 1}


@app.get("/db-check")
def db_check() -> dict:
    """Attempt a PostgreSQL connection using DATABASE_URL.

    Returns ok:true when the database is reachable, ok:false with an
    error message otherwise. Does not require any tables to exist yet
    (tables arrive in Phase 2).
    """
    database_url = os.getenv("DATABASE_URL", "")
    if not database_url:
        return {"ok": False, "error": "DATABASE_URL is not set"}
    try:
        with psycopg.connect(database_url, connect_timeout=5) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001 - report connectivity failure as JSON
        return {"ok": False, "error": str(exc)}
