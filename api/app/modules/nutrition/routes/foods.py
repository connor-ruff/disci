from uuid import UUID

from fastapi import APIRouter, status

from app.core.db import Db, DbDep
from app.modules.nutrition.routes._common import not_found, unique_errors
from app.modules.nutrition.schemas import FoodIn, FoodOut
from app.modules.nutrition.sql import queries

router = APIRouter(prefix="/foods")

DUPLICATE = "a food with this name already exists"


def _food(db: Db, food_id: UUID) -> FoodOut:
    row = db.conn.execute(queries["get_food"], {"food_id": food_id}).fetchone()
    if row is None:
        raise not_found("food")
    return FoodOut.model_validate(row)


def _fields(body: FoodIn) -> dict:
    fields = body.model_dump()
    fields["name"] = body.name.strip()
    fields["standard_unit"] = body.standard_unit.strip()
    return fields


@router.get("")
def list_foods(db: DbDep) -> list[FoodOut]:
    """The food repo, by name."""
    return [FoodOut.model_validate(r) for r in db.conn.execute(queries["list_foods"]).fetchall()]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_food(body: FoodIn, db: DbDep) -> FoodOut:
    with unique_errors(db.conn, DUPLICATE):
        row = db.conn.execute(
            queries["insert_food"], {"user_id": db.user_id, **_fields(body)}
        ).fetchone()
    return _food(db, row["id"])


@router.put("/{food_id}")
def update_food(food_id: UUID, body: FoodIn, db: DbDep) -> FoodOut:
    """Past days that logged it are recalculated with the new values."""
    with unique_errors(db.conn, DUPLICATE):
        row = db.conn.execute(
            queries["update_food"], {"food_id": food_id, **_fields(body)}
        ).fetchone()
    if row is None:
        raise not_found("food")
    return _food(db, food_id)


@router.delete("/{food_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_food(food_id: UUID, db: DbDep) -> None:
    """Removes it from the repo. Days that logged it still show it."""
    if db.conn.execute(queries["delete_food"], {"food_id": food_id}).fetchone() is None:
        raise not_found("food")
