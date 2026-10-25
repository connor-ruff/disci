from fastapi import APIRouter

from app.core.db import DbDep
from app.modules.finance.routes._common import today_in, user_prefs
from app.modules.finance.schemas import ChecklistItemOut
from app.modules.finance.sql import queries

router = APIRouter()


@router.get("/checklist")
def get_checklist(db: DbDep) -> list[ChecklistItemOut]:
    """Checklist items from the monthly budget(s) covering today, by due day."""
    today = today_in(user_prefs(db)[0])
    rows = db.conn.execute(queries["list_checklist"], {"today": today}).fetchall()
    return [ChecklistItemOut.model_validate(r) for r in rows]
