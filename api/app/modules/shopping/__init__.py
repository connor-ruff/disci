from typing import Any
from uuid import UUID

from psycopg import Connection

from app.core.module import Module
from app.modules.shopping.routes import router
from app.modules.shopping.sql import queries

DEFAULT_TYPES = ["Groceries"]


def setup(conn: Connection[dict[str, Any]], user_id: UUID) -> None:
    """First time a user enables Shopping list: start them with a Groceries type."""
    conn.execute(queries["seed_default_types"], {"user_id": user_id, "names": DEFAULT_TYPES})


module = Module(
    key="shopping",
    name="Shopping list",
    description="A live shopping list, by store or kind, with your common items a tap away",
    router=router,
    setup=setup,
)
