from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, status

from app.core.db import Db, DbDep
from app.modules.nutrition.routes._common import not_found, today_for, unique_errors
from app.modules.nutrition.schemas import GoalIn, GoalOut, GoalUpdate
from app.modules.nutrition.sql import queries

router = APIRouter(prefix="/goals")

DUPLICATE = "there's already a goal of this kind for this nutrient"


@router.get("")
def list_goals(db: DbDep, on: date | None = None) -> list[GoalOut]:
    """Goals in effect on a day (default today, in the user's timezone): targets first."""
    rows = db.conn.execute(queries["list_goals_on"], {"day": on or today_for(db)}).fetchall()
    return [GoalOut.model_validate(r) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_goal(body: GoalIn, db: DbDep) -> GoalOut:
    """Starts today. One active target and one active limit per nutrient."""
    with unique_errors(db.conn, DUPLICATE):
        row = db.conn.execute(
            queries["insert_goal"],
            {"user_id": db.user_id, "starts_on": today_for(db), **body.model_dump()},
        ).fetchone()
    return GoalOut.model_validate(row)


def _active_goal(db: Db, goal_id: UUID):
    goal = db.conn.execute(queries["get_active_goal"], {"goal_id": goal_id}).fetchone()
    if goal is None:
        raise not_found("goal")
    return goal


@router.put("/{goal_id}")
def update_goal(goal_id: UUID, body: GoalUpdate, db: DbDep) -> GoalOut:
    """Changes the amount from today on; earlier days keep the old amount.

    A goal that started today is changed in place. Otherwise the old one ends yesterday
    and a new one (with a new id) starts today.
    """
    goal = _active_goal(db, goal_id)
    today = today_for(db)
    if goal["starts_on"] >= today:
        row = db.conn.execute(
            queries["update_goal_amount"], {"goal_id": goal_id, "amount": body.amount}
        ).fetchone()
        return GoalOut.model_validate(row)
    db.conn.execute(queries["end_goal"], {"goal_id": goal_id, "ends_on": today - timedelta(1)})
    row = db.conn.execute(
        queries["insert_goal"],
        {
            "user_id": db.user_id,
            "nutrient": goal["nutrient"],
            "kind": goal["kind"],
            "amount": body.amount,
            "starts_on": today,
        },
    ).fetchone()
    return GoalOut.model_validate(row)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: UUID, db: DbDep) -> None:
    """Ends the goal: it no longer applies from today, but still covers earlier days."""
    goal = _active_goal(db, goal_id)
    today = today_for(db)
    if goal["starts_on"] >= today:
        db.conn.execute(queries["delete_goal"], {"goal_id": goal_id})
    else:
        db.conn.execute(queries["end_goal"], {"goal_id": goal_id, "ends_on": today - timedelta(1)})
