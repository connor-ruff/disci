from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from psycopg import Connection, errors

from app.core.db import DbDep
from app.core.sql import Queries
from app.modules.finance import service
from app.modules.finance.schemas import (
    BudgetCreate,
    BudgetDetail,
    BudgetItemCreate,
    BudgetItemOut,
    BudgetItemUpdate,
    BudgetOut,
    BudgetTransactionOut,
    BudgetUpdate,
    CategoryCreate,
    CategoryOut,
    CategoryUpdate,
    TransactionCreate,
    TransactionOut,
)

queries = Queries(__file__)
router = APIRouter()  # mounted at /finance


def _not_found(what: str) -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} not found")


def _invalid(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail)


@contextmanager
def _constraint_errors(conn: Connection[Any]) -> Iterator[None]:
    """Turns constraint violations into 4xx responses instead of 500s.

    The savepoint keeps the request's transaction usable after the failed statement.
    """
    try:
        with conn.transaction():
            yield
    except errors.UniqueViolation as e:
        raise HTTPException(status.HTTP_409_CONFLICT, "already exists") from e
    except errors.ForeignKeyViolation as e:
        # e.g. an expense item pointed at an income category, or an unknown category
        raise _invalid("category doesn't exist or doesn't match the item's kind") from e


# --- Categories ------------------------------------------------------------------


@router.get("/categories")
def list_categories(db: DbDep) -> list[CategoryOut]:
    rows = db.conn.execute(queries["list_categories"]).fetchall()
    return [CategoryOut.model_validate(r) for r in rows]


@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryCreate, db: DbDep) -> CategoryOut:
    with _constraint_errors(db.conn):
        row = db.conn.execute(
            queries["insert_category"], {"user_id": db.user_id, **body.model_dump()}
        ).fetchone()
    return CategoryOut.model_validate(row)


@router.put("/categories/{category_id}")
def update_category(category_id: UUID, body: CategoryUpdate, db: DbDep) -> CategoryOut:
    with _constraint_errors(db.conn):
        row = db.conn.execute(
            queries["update_category"], {"category_id": category_id, **body.model_dump()}
        ).fetchone()
    if row is None:
        raise _not_found("category")
    return CategoryOut.model_validate(row)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: UUID, db: DbDep) -> None:
    """Items in the category become Uncategorized."""
    params = {"category_id": category_id}
    if db.conn.execute(queries["delete_category"], params).fetchone() is None:
        raise _not_found("category")
    db.conn.execute(queries["uncategorize_items"], params)


# --- Budgets -----------------------------------------------------------------------


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
            raise _invalid("budget to copy from not found")
        if source["period_type"] != body.period_type:
            raise _invalid("can only copy from a budget of the same period type")

    user = db.conn.execute(queries["get_week_start"], {"user_id": db.user_id}).fetchone()
    week_starts_on = user["week_starts_on"] if user else 1
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
        raise _not_found("budget")
    rows = db.conn.execute(queries["list_budget_items"], {"budget_id": budget_id}).fetchall()
    items = [BudgetItemOut.model_validate(r) for r in rows]
    return BudgetDetail(**budget, items=items, **service.kind_totals(items))


@router.put("/budgets/{budget_id}")
def update_budget(budget_id: UUID, body: BudgetUpdate, db: DbDep) -> BudgetOut:
    row = db.conn.execute(
        queries["update_budget"], {"budget_id": budget_id, **body.model_dump()}
    ).fetchone()
    if row is None:
        raise _not_found("budget")
    return BudgetOut.model_validate(row)


@router.delete("/budgets/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(budget_id: UUID, db: DbDep) -> None:
    if db.conn.execute(queries["delete_budget"], {"budget_id": budget_id}).fetchone() is None:
        raise _not_found("budget")


# --- Budget items --------------------------------------------------------------------


@router.post("/budgets/{budget_id}/items", status_code=status.HTTP_201_CREATED)
def create_budget_item(budget_id: UUID, body: BudgetItemCreate, db: DbDep) -> BudgetDetail:
    """Returns the whole updated budget, since totals change too."""
    if db.conn.execute(queries["get_budget"], {"budget_id": budget_id}).fetchone() is None:
        raise _not_found("budget")
    with _constraint_errors(db.conn):
        db.conn.execute(
            queries["insert_budget_item"],
            {"user_id": db.user_id, "budget_id": budget_id, **body.model_dump()},
        )
    return get_budget(budget_id, db)


@router.put("/items/{item_id}")
def update_budget_item(item_id: UUID, body: BudgetItemUpdate, db: DbDep) -> BudgetDetail:
    item = db.conn.execute(queries["get_budget_item"], {"item_id": item_id}).fetchone()
    if item is None:
        raise _not_found("budget item")
    with _constraint_errors(db.conn):
        db.conn.execute(queries["update_budget_item"], {"item_id": item_id, **body.model_dump()})
    return get_budget(item["budget_id"], db)


@router.delete("/items/{item_id}")
def delete_budget_item(item_id: UUID, db: DbDep) -> BudgetDetail:
    """Its transactions stay, but no longer count toward this budget."""
    item = db.conn.execute(queries["get_budget_item"], {"item_id": item_id}).fetchone()
    if item is None:
        raise _not_found("budget item")
    db.conn.execute(queries["delete_budget_item"], {"item_id": item_id})
    return get_budget(item["budget_id"], db)


# --- Transactions --------------------------------------------------------------------


@router.post("/transactions", status_code=status.HTTP_201_CREATED)
def create_transaction(body: TransactionCreate, db: DbDep) -> TransactionOut:
    item_ids = [a.budget_item_id for a in body.allocations]
    rows = db.conn.execute(queries["get_item_budgets"], {"item_ids": item_ids}).fetchall()
    error = service.allocation_errors(
        body.amount, body.allocations, {r["id"]: r["budget_id"] for r in rows}
    )
    if error:
        raise _invalid(error)

    txn = db.conn.execute(
        queries["insert_transaction"],
        {"user_id": db.user_id, **body.model_dump(exclude={"allocations"})},
    ).fetchone()
    if txn is None:
        raise RuntimeError("INSERT ... RETURNING returned no row")
    with db.conn.cursor() as cur:
        cur.executemany(
            queries["insert_allocation"],
            [
                {"user_id": db.user_id, "transaction_id": txn["id"], **a.model_dump()}
                for a in body.allocations
            ],
        )
    return TransactionOut.model_validate(txn)


@router.get("/budgets/{budget_id}/transactions")
def list_budget_transactions(budget_id: UUID, db: DbDep) -> list[BudgetTransactionOut]:
    if db.conn.execute(queries["get_budget"], {"budget_id": budget_id}).fetchone() is None:
        raise _not_found("budget")
    rows = db.conn.execute(queries["list_budget_transactions"], {"budget_id": budget_id}).fetchall()
    return [BudgetTransactionOut.model_validate(r) for r in rows]


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(transaction_id: UUID, db: DbDep) -> None:
    params = {"transaction_id": transaction_id}
    if db.conn.execute(queries["delete_transaction"], params).fetchone() is None:
        raise _not_found("transaction")
