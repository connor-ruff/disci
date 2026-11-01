"""Shopping list HTTP routes, mounted at /shopping."""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Response, status
from psycopg import Connection, errors

from app.core.db import Db, DbDep
from app.modules.shopping.schemas import (
    ClearDone,
    Cleared,
    CommonIn,
    CommonOut,
    DoneIn,
    ItemCreate,
    ItemOut,
    ItemUpdate,
    Order,
    ShoppingTypeIn,
    ShoppingTypeOut,
)
from app.modules.shopping.sql import queries

router = APIRouter()


def not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


@contextmanager
def unique_errors(conn: Connection[Any], detail: str) -> Iterator[None]:
    """Turns a unique violation into a 409. The savepoint keeps the request usable."""
    try:
        with conn.transaction():
            yield
    except errors.UniqueViolation as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail) from e


def _check_type(db: Db, type_id: UUID | None) -> None:
    """A type must exist (and not be deleted); null is Uncategorized."""
    if (
        type_id is not None
        and db.conn.execute(queries["get_type"], {"type_id": type_id}).fetchone() is None
    ):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "shopping type doesn't exist")


def _item(row: dict[str, Any]) -> ItemOut:
    return ItemOut.model_validate({**row, "done": row["done_at"] is not None})


def _common(db: Db, common_id: UUID) -> CommonOut:
    row = db.conn.execute(queries["get_common"], {"common_id": common_id}).fetchone()
    if row is None:
        raise not_found("common item")
    return CommonOut.model_validate(row)


# --- Types ---------------------------------------------------------------------------


@router.get("/types")
def list_types(db: DbDep) -> list[ShoppingTypeOut]:
    rows = db.conn.execute(queries["list_types"]).fetchall()
    return [ShoppingTypeOut.model_validate(r) for r in rows]


@router.post("/types", status_code=status.HTTP_201_CREATED)
def create_type(body: ShoppingTypeIn, db: DbDep) -> ShoppingTypeOut:
    with unique_errors(db.conn, "a type with that name already exists"):
        row = db.conn.execute(
            queries["insert_type"], {"user_id": db.user_id, "name": body.name}
        ).fetchone()
    return ShoppingTypeOut.model_validate(row)


@router.put("/types/order")
def reorder_types(body: Order, db: DbDep) -> list[ShoppingTypeOut]:
    db.conn.execute(queries["reorder_types"], body.model_dump())
    return list_types(db)


@router.put("/types/{type_id}")
def rename_type(type_id: UUID, body: ShoppingTypeIn, db: DbDep) -> ShoppingTypeOut:
    with unique_errors(db.conn, "a type with that name already exists"):
        row = db.conn.execute(
            queries["update_type"], {"type_id": type_id, "name": body.name}
        ).fetchone()
    if row is None:
        raise not_found("shopping type")
    return ShoppingTypeOut.model_validate(row)


@router.delete("/types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_type(type_id: UUID, db: DbDep) -> None:
    """Its list items and common items become Uncategorized."""
    params = {"type_id": type_id}
    if db.conn.execute(queries["delete_type"], params).fetchone() is None:
        raise not_found("shopping type")
    db.conn.execute(queries["uncategorize"], params)


# --- List items ----------------------------------------------------------------------


@router.get("/items")
def list_items(db: DbDep) -> list[ItemOut]:
    """Everything on the list, crossed off or not, in list order."""
    return [_item(r) for r in db.conn.execute(queries["list_items"]).fetchall()]


@router.post("/items", status_code=status.HTTP_201_CREATED)
def create_item(body: ItemCreate, db: DbDep) -> ItemOut:
    _check_type(db, body.shopping_type_id)
    fields = body.model_dump(exclude={"save_as_common"})
    row = db.conn.execute(queries["insert_item"], {"user_id": db.user_id, **fields}).fetchone()
    if body.save_as_common:
        db.conn.execute(queries["insert_common_if_new"], {"user_id": db.user_id, **fields})
    return _item(row)


@router.put("/items/order")
def reorder_items(body: Order, db: DbDep) -> list[ItemOut]:
    db.conn.execute(queries["reorder_items"], body.model_dump())
    return list_items(db)


@router.post("/items/clear-done")
def clear_done(body: ClearDone, db: DbDep) -> Cleared:
    """Removes crossed-off items for good: every type's, or one type's."""
    rows = db.conn.execute(queries["clear_done"], body.model_dump()).fetchall()
    return Cleared(removed=len(rows))


@router.put("/items/{item_id}")
def update_item(item_id: UUID, body: ItemUpdate, db: DbDep) -> ItemOut:
    _check_type(db, body.shopping_type_id)
    row = db.conn.execute(
        queries["update_item"], {"item_id": item_id, **body.model_dump()}
    ).fetchone()
    if row is None:
        raise not_found("item")
    return _item(row)


@router.put("/items/{item_id}/done")
def set_done(item_id: UUID, body: DoneIn, db: DbDep) -> ItemOut:
    """Cross an item off (it stays on the list until removed), or put it back."""
    row = db.conn.execute(
        queries["set_item_done"], {"item_id": item_id, "done": body.done}
    ).fetchone()
    if row is None:
        raise not_found("item")
    return _item(row)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: UUID, db: DbDep) -> None:
    """Removes it for good."""
    if db.conn.execute(queries["delete_item"], {"item_id": item_id}).fetchone() is None:
        raise not_found("item")


# --- Common items --------------------------------------------------------------------


@router.get("/common")
def list_common(db: DbDep) -> list[CommonOut]:
    rows = db.conn.execute(queries["list_common"]).fetchall()
    return [CommonOut.model_validate(r) for r in rows]


@router.post("/common", status_code=status.HTTP_201_CREATED)
def create_common(body: CommonIn, db: DbDep) -> CommonOut:
    _check_type(db, body.shopping_type_id)
    with unique_errors(db.conn, "that's already a common item"):
        row = db.conn.execute(
            queries["insert_common"], {"user_id": db.user_id, **body.model_dump()}
        ).fetchone()
    return _common(db, row["id"])


@router.put("/common/{common_id}")
def update_common(common_id: UUID, body: CommonIn, db: DbDep) -> CommonOut:
    _check_type(db, body.shopping_type_id)
    with unique_errors(db.conn, "that's already a common item"):
        row = db.conn.execute(
            queries["update_common"], {"common_id": common_id, **body.model_dump()}
        ).fetchone()
    if row is None:
        raise not_found("common item")
    return _common(db, common_id)


@router.delete("/common/{common_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_common(common_id: UUID, db: DbDep) -> None:
    if db.conn.execute(queries["delete_common"], {"common_id": common_id}).fetchone() is None:
        raise not_found("common item")


@router.post("/common/{common_id}/add", status_code=status.HTTP_201_CREATED)
def add_common(common_id: UUID, db: DbDep, response: Response) -> ItemOut:
    """Copies a common item onto the list (no link is kept). If the same item is already
    on the list and not crossed off, that one is returned instead (200)."""
    common = _common(db, common_id)
    fields = common.model_dump(include={"name", "notes", "shopping_type_id"})
    existing = db.conn.execute(queries["find_open_item"], fields).fetchone()
    if existing:
        response.status_code = status.HTTP_200_OK
        return _item(existing)
    row = db.conn.execute(queries["insert_item"], {"user_id": db.user_id, **fields}).fetchone()
    return _item(row)
