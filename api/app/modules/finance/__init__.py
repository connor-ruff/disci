from typing import Any
from uuid import UUID

from psycopg import Connection

from app.core.module import Module
from app.core.sql import Queries
from app.modules.finance import service
from app.modules.finance.router import router

queries = Queries(__file__)


def setup(conn: Connection[dict[str, Any]], user_id: UUID) -> None:
    """First time a user enables Finance: give them the default expense categories."""
    conn.execute(
        queries["seed_default_categories"],
        {"user_id": user_id, "names": service.DEFAULT_EXPENSE_CATEGORIES},
    )


module = Module(
    key="finance",
    name="Finance",
    description="Budgets, transactions and bills",
    router=router,
    setup=setup,
)
