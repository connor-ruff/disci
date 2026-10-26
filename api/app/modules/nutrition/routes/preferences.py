from fastapi import APIRouter

from app.core.db import DbDep
from app.modules.nutrition import service
from app.modules.nutrition.schemas import NutrientOut, PreferencesIn, PreferencesOut
from app.modules.nutrition.sql import queries

router = APIRouter(prefix="/preferences")


def _out(tracked: list[str]) -> PreferencesOut:
    return PreferencesOut(
        tracked_nutrients=service.in_display_order(tracked),
        nutrients=[NutrientOut(key=n.key, label=n.label, unit=n.unit) for n in service.NUTRIENTS],
    )


@router.get("")
def get_preferences(db: DbDep) -> PreferencesOut:
    """Which nutrients the user tracks (shown everywhere), plus every nutrient the app knows."""
    row = db.conn.execute(queries["get_preferences"]).fetchone()
    return _out(row["tracked_nutrients"] if row else service.DEFAULT_TRACKED)


@router.put("")
def update_preferences(body: PreferencesIn, db: DbDep) -> PreferencesOut:
    row = db.conn.execute(
        queries["upsert_preferences"],
        {"user_id": db.user_id, "tracked_nutrients": list(dict.fromkeys(body.tracked_nutrients))},
    ).fetchone()
    return _out(row["tracked_nutrients"])
