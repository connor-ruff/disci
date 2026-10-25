from uuid import UUID

from fastapi import APIRouter, status

from app.core.db import Db, DbDep
from app.modules.finance import service
from app.modules.finance.routes._common import constraint_errors, invalid, not_found, user_prefs
from app.modules.finance.schemas import (
    BudgetCreate,
    BudgetDetail,
    BudgetItemCreate,
    BudgetItemOut,
    BudgetItemUpdate,
    BudgetOut,
    BudgetUpdate,
    ItemOrder,
)
from app.modules.finance.sql import queries

router = APIRouter()


@router.get("/budgets")
def list_budgets(db: DbDep) -> list[BudgetOut]:
    rows = db.conn.execute(queries["list_budgets"]).fetchall()
    return [BudgetOut.model_validate(r) for r in rows]


@router.post("/budgets", status_code=status.HTTP_201_CREATED)
def create_budget(body: BudgetCreate, db: DbDep) -> BudgetOut:
    source = None
    if body.copy_from_budget_id is not None:
        source = db.conn.execute(
            queries["get_budget"], {"budget_id": body.copy_from_budget_id}
        ).fetchone()
        if source is None:
            raise invalid("budget to copy from not found")
        if source["period_type"] != body.period_type:
            raise invalid("can only copy from a budget of the same period type")

    _, week_starts_on = user_prefs(db)
    start, end = service.period_bounds(body.period_type, body.period_date, week_starts_on)
    row = db.conn.execute(
        queries["insert_budget"],
        {
            "user_id": db.user_id,
            "name": body.name or service.default_budget_name(body.period_type, start),
            "period_type": body.period_type,
            "period_start": start,
            "period_end": end,
        },
    ).fetchone()
    if row is None:
        raise RuntimeError("INSERT ... RETURNING returned no row")
    if source is not None:
        db.conn.execute(
            queries["copy_budget_items"],
            {"user_id": db.user_id, "budget_id": row["id"], "source_budget_id": source["id"]},
        )
    return BudgetOut.model_validate(row)


@router.get("/budgets/{budget_id}")
def get_budget(budget_id: UUID, db: DbDep) -> BudgetDetail:
    budget = db.conn.execute(queries["get_budget"], {"budget_id": budget_id}).fetchone()
    if budget is None:
        raise not_found("budget")
    rows = db.conn.execute(queries["list_budget_items"], {"budget_id": budget_id}).fetchall()
    items = [BudgetItemOut.model_validate(r) for r in rows]
    return BudgetDetail(**budget, items=items, **service.kind_totals(items))


@router.put("/budgets/{budget_id}")
def update_budget(budget_id: UUID, body: BudgetUpdate, db: DbDep) -> BudgetOut:
    row = db.conn.execute(
        queries["update_budget"], {"budget_id": budget_id, **body.model_dump()}
    ).fetchone()
    if row is None:
        raise not_found("budget")
    return BudgetOut.model_validate(row)


@router.delete("/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: UUID, db: DbDep) -> None:
    if db.conn.execute(queries["delete_budget"], {"budget_id": budget_id}).fetchone() is None:
        raise not_found("budget")


# --- Items -------------------------------------------------------------------------------


def _check_checklist_allowed(period_type: str, is_checklist_item: bool) -> None:
    if is_checklist_item and period_type != "month":
        raise invalid("only items in monthly budgets can be on the monthly checklist")


@router.post("/budgets/{budget_id}/items", status_code=status.HTTP_201_CREATED)
def create_budget_item(budget_id: UUID, body: BudgetItemCreate, db: DbDep) -> BudgetDetail:
    """Returns the whole updated budget, since totals change too."""
    budget = db.conn.execute(queries["get_budget"], {"budget_id": budget_id}).fetchone()
    if budget is None:
        raise not_found("budget")
    _check_checklist_allowed(budget["period_type"], body.is_checklist_item)
    with constraint_errors(db.conn):
        db.conn.execute(
            queries["insert_budget_item"],
            {"user_id": db.user_id, "budget_id": budget_id, **body.model_dump()},
        )
    return get_budget(budget_id, db)


@router.put("/budgets/{budget_id}/items/order")
def reorder_budget_items(budget_id: UUID, body: ItemOrder, db: DbDep) -> BudgetDetail:
    if db.conn.execute(queries["get_budget"], {"budget_id": budget_id}).fetchone() is None:
        raise not_found("budget")
    db.conn.execute(queries["reorder_budget_items"], {"budget_id": budget_id, "ids": body.ids})
    return get_budget(budget_id, db)


def _get_item(db: Db, item_id: UUID):
    item = db.conn.execute(queries["get_budget_item"], {"item_id": item_id}).fetchone()
    if item is None:
        raise not_found("budget item")
    return item


@router.put("/items/{item_id}")
def update_budget_item(item_id: UUID, body: BudgetItemUpdate, db: DbDep) -> BudgetDetail:
    item = _get_item(db, item_id)
    _check_checklist_allowed(item["period_type"], body.is_checklist_item)
    with constraint_errors(db.conn):
        db.conn.execute(queries["update_budget_item"], {"item_id": item_id, **body.model_dump()})
    return get_budget(item["budget_id"], db)


@router.delete("/items/{item_id}")
def delete_budget_item(item_id: UUID, db: DbDep) -> BudgetDetail:
    """Its transactions stay, but no longer count toward this budget."""
    item = _get_item(db, item_id)
    db.conn.execute(queries["delete_budget_item"], {"item_id": item_id})
    return get_budget(item["budget_id"], db)
