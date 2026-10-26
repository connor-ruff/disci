from typing import Any
from uuid import UUID

from psycopg import Connection

from app.core.module import Module
from app.modules.nutrition import service
from app.modules.nutrition.routes import router
from app.modules.nutrition.sql import queries


def setup(conn: Connection[dict[str, Any]], user_id: UUID) -> None:
    """First time a user enables Nutrition: track the default nutrients."""
    conn.execute(
        queries["upsert_preferences"],
        {"user_id": user_id, "tracked_nutrients": service.DEFAULT_TRACKED},
    )


module = Module(
    key="nutrition",
    name="Nutrition",
    description="Food log, food repo and daily macro goals",
    router=router,
    setup=setup,
)
