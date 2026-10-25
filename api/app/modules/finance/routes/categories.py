from uuid import UUID

from fastapi import APIRouter, status

from app.core.db import DbDep
from app.modules.finance.routes._common import constraint_errors, not_found
from app.modules.finance.schemas import CategoryCreate, CategoryOrder, CategoryOut, CategoryUpdate
from app.modules.finance.sql import queries

router = APIRouter(prefix="/categories")


@router.get("")
def list_categories(db: DbDep) -> list[CategoryOut]:
    rows = db.conn.execute(queries["list_categories"]).fetchall()
    return [CategoryOut.model_validate(r) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryCreate, db: DbDep) -> CategoryOut:
    with constraint_errors(db.conn):
        row = db.conn.execute(
            queries["insert_category"], {"user_id": db.user_id, **body.model_dump()}
        ).fetchone()
    return CategoryOut.model_validate(row)


@router.put("/order")
def reorder_categories(body: CategoryOrder, db: DbDep) -> list[CategoryOut]:
    db.conn.execute(queries["reorder_categories"], body.model_dump())
    return list_categories(db)


@router.put("/{category_id}")
def update_category(category_id: UUID, body: CategoryUpdate, db: DbDep) -> CategoryOut:
    with constraint_errors(db.conn):
        row = db.conn.execute(
            queries["update_category"], {"category_id": category_id, **body.model_dump()}
        ).fetchone()
    if row is None:
        raise not_found("category")
    return CategoryOut.model_validate(row)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: UUID, db: DbDep) -> None:
    """Items in the category become Uncategorized."""
    params = {"category_id": category_id}
    if db.conn.execute(queries["delete_category"], params).fetchone() is None:
        raise not_found("category")
    db.conn.execute(queries["uncategorize_items"], params)
