from fastapi import APIRouter

from app.core.db import DbDep
from app.modules.finance.schemas import FinancePreferencesIn, FinancePreferencesOut
from app.modules.finance.sql import queries

router = APIRouter(prefix="/preferences")


@router.get("")
def get_preferences(db: DbDep) -> FinancePreferencesOut:
    """Display settings. Defaults (everything off) until the user first saves."""
    row = db.conn.execute(queries["get_preferences"]).fetchone()
    return (
        FinancePreferencesOut.model_validate(row)
        if row
        else FinancePreferencesOut(show_category_totals=False, show_kind_totals=False)
    )


@router.put("")
def update_preferences(body: FinancePreferencesIn, db: DbDep) -> FinancePreferencesOut:
    row = db.conn.execute(
        queries["upsert_preferences"], {"user_id": db.user_id, **body.model_dump()}
    ).fetchone()
    return FinancePreferencesOut.model_validate(row)
