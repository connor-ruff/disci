from uuid import UUID

from fastapi import APIRouter, status

from app.core.db import Db, DbDep
from app.modules.finance import recurring
from app.modules.finance.routes._common import constraint_errors, not_found, today_in, user_prefs
from app.modules.finance.schemas import RecurringIn, RecurringOut
from app.modules.finance.sql import queries

router = APIRouter(prefix="/recurring")


def _out(row, today) -> RecurringOut:
    return RecurringOut.model_validate(
        {**row, "next_occurrence": recurring.next_occurrence(recurring.Schedule.of(row), today)}
    )


def _generate_now(db: Db) -> None:
    """Creates anything due today right away instead of waiting for the hourly job."""
    timezone, _ = user_prefs(db)
    recurring.generate_for_user(db.conn, db.user_id, timezone, today_in(timezone))


@router.get("")
def list_recurring(db: DbDep) -> list[RecurringOut]:
    today = today_in(user_prefs(db)[0])
    return [_out(r, today) for r in db.conn.execute(queries["list_recurring"]).fetchall()]


def _get(db: Db, recurring_id: UUID) -> RecurringOut:
    row = db.conn.execute(queries["get_recurring"], {"recurring_id": recurring_id}).fetchone()
    if row is None:
        raise not_found("recurring transaction")
    return _out(row, today_in(user_prefs(db)[0]))


@router.post("", status_code=status.HTTP_201_CREATED)
def create_recurring(body: RecurringIn, db: DbDep) -> RecurringOut:
    with constraint_errors(db.conn):
        row = db.conn.execute(
            queries["insert_recurring"],
            {"user_id": db.user_id, **body.model_dump(exclude={"paused"})},
        ).fetchone()
    if row is None:
        raise RuntimeError("INSERT ... RETURNING returned no row")
    _generate_now(db)
    return _get(db, row["id"])


@router.put("/{recurring_id}")
def update_recurring(recurring_id: UUID, body: RecurringIn, db: DbDep) -> RecurringOut:
    """Changes apply to future occurrences; transactions already created stay as they are."""
    with constraint_errors(db.conn):
        row = db.conn.execute(
            queries["update_recurring"], {"recurring_id": recurring_id, **body.model_dump()}
        ).fetchone()
    if row is None:
        raise not_found("recurring transaction")
    _generate_now(db)
    return _get(db, recurring_id)


@router.delete("/{recurring_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recurring(recurring_id: UUID, db: DbDep) -> None:
    """Stops future occurrences. Transactions it already created stay."""
    params = {"recurring_id": recurring_id}
    if db.conn.execute(queries["delete_recurring"], params).fetchone() is None:
        raise not_found("recurring transaction")
