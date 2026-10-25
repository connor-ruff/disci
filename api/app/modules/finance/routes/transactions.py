from uuid import UUID

from fastapi import APIRouter, status

from app.core.db import Db, DbDep
from app.modules.finance import service
from app.modules.finance.routes._common import invalid, not_found
from app.modules.finance.schemas import (
    AllocationIn,
    AllocationsReplace,
    ApproveIn,
    BudgetTransactionOut,
    Inbox,
    InboxTransactionOut,
    TransactionCreate,
    TransactionOut,
)
from app.modules.finance.sql import queries

router = APIRouter()


def _write_allocations(db: Db, transaction_id: UUID, amount, allocations: list[AllocationIn]):
    """Validates and inserts allocations for a transaction (replacing none)."""
    item_ids = [a.budget_item_id for a in allocations]
    rows = db.conn.execute(queries["get_item_budgets"], {"item_ids": item_ids}).fetchall()
    error = service.allocation_errors(amount, allocations, {r["id"]: r["budget_id"] for r in rows})
    if error:
        raise invalid(error)
    with db.conn.cursor() as cur:
        cur.executemany(
            queries["insert_allocation"],
            [
                {"user_id": db.user_id, "transaction_id": transaction_id, **a.model_dump()}
                for a in allocations
            ],
        )


@router.post("/transactions", status_code=status.HTTP_201_CREATED)
def create_transaction(body: TransactionCreate, db: DbDep) -> TransactionOut:
    txn = db.conn.execute(
        queries["insert_transaction"],
        {"user_id": db.user_id, **body.model_dump(exclude={"allocations"})},
    ).fetchone()
    if txn is None:
        raise RuntimeError("INSERT ... RETURNING returned no row")
    _write_allocations(db, txn["id"], body.amount, body.allocations)
    return TransactionOut.model_validate(txn)


@router.put("/transactions/{transaction_id}/allocations")
def replace_allocations(
    transaction_id: UUID, body: AllocationsReplace, db: DbDep
) -> TransactionOut:
    """Sets which budget items a transaction counts toward (e.g. assigning from the inbox)."""
    txn = db.conn.execute(queries["get_transaction"], {"transaction_id": transaction_id}).fetchone()
    if txn is None:
        raise not_found("transaction")
    db.conn.execute(queries["delete_transaction_allocations"], {"transaction_id": transaction_id})
    _write_allocations(db, transaction_id, txn["amount"], body.allocations)
    return TransactionOut.model_validate(txn)


@router.post("/transactions/{transaction_id}/approve")
def approve_transaction(transaction_id: UUID, body: ApproveIn, db: DbDep) -> TransactionOut:
    row = db.conn.execute(
        queries["approve_transaction"], {"transaction_id": transaction_id, "amount": body.amount}
    ).fetchone()
    if row is None:
        raise not_found("pending transaction")
    return TransactionOut.model_validate(row)


@router.post("/transactions/{transaction_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_transaction(transaction_id: UUID, db: DbDep) -> None:
    """Discards a pending transaction. Its rule won't generate that date again."""
    txn = db.conn.execute(queries["get_transaction"], {"transaction_id": transaction_id}).fetchone()
    if txn is None or txn["status"] != "pending":
        raise not_found("pending transaction")
    db.conn.execute(queries["delete_transaction"], {"transaction_id": transaction_id})


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(transaction_id: UUID, db: DbDep) -> None:
    params = {"transaction_id": transaction_id}
    if db.conn.execute(queries["delete_transaction"], params).fetchone() is None:
        raise not_found("transaction")


@router.get("/budgets/{budget_id}/transactions")
def list_budget_transactions(budget_id: UUID, db: DbDep) -> list[BudgetTransactionOut]:
    if db.conn.execute(queries["get_budget"], {"budget_id": budget_id}).fetchone() is None:
        raise not_found("budget")
    rows = db.conn.execute(queries["list_budget_transactions"], {"budget_id": budget_id}).fetchall()
    return [BudgetTransactionOut.model_validate(r) for r in rows]


@router.get("/inbox")
def get_inbox(db: DbDep) -> Inbox:
    """Transactions needing attention: awaiting approval, or not in any budget yet."""
    pending = db.conn.execute(queries["list_pending"]).fetchall()
    unassigned = db.conn.execute(queries["list_unassigned"]).fetchall()
    return Inbox(
        pending=[InboxTransactionOut.model_validate(r) for r in pending],
        unassigned=[InboxTransactionOut.model_validate(r) for r in unassigned],
    )
