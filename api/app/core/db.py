from collections.abc import Iterator
from dataclasses import dataclass
from typing import Annotated, Any
from uuid import UUID

from fastapi import Depends, HTTPException, status
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.core.auth import Identity, get_identity
from app.core.rds_iam import IamAuthConnection
from app.core.sql import Queries

queries = Queries(__file__)

_pool: ConnectionPool | None = None


def open_pool(database_url: str, iam_auth: bool = False) -> None:
    global _pool
    _pool = ConnectionPool(
        database_url,
        connection_class=IamAuthConnection if iam_auth else Connection,
        min_size=1,
        max_size=5,
        kwargs={"row_factory": dict_row},
        # Lambda freezes between invocations; verify a connection is alive before use.
        check=ConnectionPool.check_connection,
        open=True,
    )


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


@dataclass(frozen=True)
class Db:
    """A request's database transaction, already scoped to the signed-in user."""

    conn: Connection[dict[str, Any]]
    user_id: UUID


def get_db(identity: Annotated[Identity, Depends(get_identity)]) -> Iterator[Db]:
    """One transaction per request.

    Maps the identity to a core.users row (creating it on first web sign-in), then sets
    app.user_id for the transaction so row-level security only exposes that user's rows.
    An identity without an email (MCP) must already have a row, else 403.
    Commits if the endpoint returns normally, rolls back if it raises.
    """
    if _pool is None:
        raise RuntimeError("database pool not open")
    with _pool.connection() as conn, conn.transaction():
        if identity.email is None:
            user = conn.execute(queries["find_user"], {"cognito_sub": identity.sub}).fetchone()
            if user is None or user["id"] is None:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN, "Sign in to the Disci web app once first"
                )
        else:
            user = conn.execute(
                queries["ensure_user"], {"cognito_sub": identity.sub, "email": identity.email}
            ).fetchone()
            if user is None or user["id"] is None:
                raise RuntimeError("core.ensure_user returned no id")
        conn.execute(queries["set_user"], {"user_id": str(user["id"])})
        yield Db(conn=conn, user_id=user["id"])


# scope="function" ends the transaction (commit/rollback) before the response is sent,
# so a client never sees success for a write that failed to commit.
DbDep = Annotated[Db, Depends(get_db, scope="function")]
