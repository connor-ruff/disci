"""Hourly job: create due recurring transactions for every user.

Runs as the `disci-jobs` Lambda on an EventBridge schedule (handler
app.jobs.recurring.handler), and locally via `make jobs-recurring`. It connects as the
API's database role, finds users with active rules through a narrow SECURITY DEFINER
function, then works one user at a time with app.user_id set, so row-level security
applies exactly as it does for API requests.
"""

import logging
from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row

from app.core.db import queries as core_queries
from app.core.rds_iam import IamAuthConnection
from app.core.settings import get_settings
from app.modules.finance.recurring import generate_for_user
from app.modules.finance.routes._common import today_in
from app.modules.finance.sql import queries

# Named, so its JSON lines carry `"logger": "app.jobs.recurring"` (alarms filter on it).
logger = logging.getLogger("app.jobs.recurring")
logging.getLogger().setLevel(logging.INFO)


def run() -> dict[str, int]:
    settings = get_settings()
    connection_class = IamAuthConnection if settings.db_iam_auth else Connection
    created = 0
    with connection_class.connect(settings.database_url, row_factory=dict_row) as conn:
        users = conn.execute(queries["users_with_recurring"]).fetchall()
        conn.commit()
        for user in users:
            # One transaction per user: a failure for one user doesn't block the others.
            try:
                with conn.transaction():
                    conn.execute(core_queries["set_user"], {"user_id": str(user["user_id"])})
                    created += generate_for_user(
                        conn, user["user_id"], user["timezone"], today_in(user["timezone"])
                    )
            except Exception:
                logger.exception(
                    "recurring generation failed for user %s",
                    user["user_id"],
                    extra={"user_id": str(user["user_id"])},
                )
    logger.info(
        "recurring: %d users, %d transactions created",
        len(users),
        created,
        extra={"users_processed": len(users), "transactions_created": created},
    )
    return {"users": len(users), "created": created}


def handler(event: dict[str, Any], context: Any) -> dict[str, int]:
    return run()


if __name__ == "__main__":
    logging.basicConfig()
    print(run())
