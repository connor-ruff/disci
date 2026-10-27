from uuid import UUID

from fastapi import APIRouter, status

from app.core.db import Db, DbDep
from app.modules.finance.routes._common import not_found, write_allocations
from app.modules.finance.schemas import (
    AllocationsReplace,
    ApproveIn,
    BudgetTransactionOut,
    TransactionCreate,
    TransactionDetail,
    TransactionOut,
    TransactionUpdate,
)
from app.modules.finance.sql import queries

router = APIRouter()


@router.post("/transactions", status_code=status.HTTP_201_CREATED)
def create_transaction(body: TransactionCreate, db: DbDep) -> TransactionOut:
    txn = db.conn.execute(
        queries["insert_transaction"],
        {"user_id": db.user_id, **body.model_dump(exclude={"allocations"})},
    ).fetchone()
    if txn is None:
        raise RuntimeError("INSERT ... RETURNING returned no row")
    write_allocations(db, txn["id"], body.amount, body.allocations)
    return TransactionOut.model_validate(txn)


def _detail(db: Db, txn) -> TransactionDetail:
    rows = db.conn.execute(
        queries["list_transaction_allocations"], {"transaction_id": txn["id"]}
    ).fetchall()
    return TransactionDetail.model_validate({**txn, "allocations": rows})


@router.get("/transactions/{transaction_id}")
def get_transaction(transaction_id: UUID, db: DbDep) -> TransactionDetail:
    txn = db.conn.execute(queries["get_transaction"], {"transaction_id": transaction_id}).fetchone()
    if txn is None:
        raise not_found("transaction")
    return _detail(db, txn)


@router.put("/transactions/{transaction_id}")
def update_transaction(
    transaction_id: UUID, body: TransactionUpdate, db: DbDep
) -> TransactionDetail:
    """Edits a transaction and replaces where it counts (its allocations)."""
    txn = db.conn.execute(
        queries["update_transaction"],
        {"transaction_id": transaction_id, **body.model_dump(exclude={"allocations"})},
    ).fetchone()
    if txn is None:
        raise not_found("transaction")
    db.conn.execute(queries["delete_transaction_allocations"], {"transaction_id": transaction_id})
    write_allocations(db, transaction_id, body.amount, body.allocations)
    return _detail(db, txn)


@router.put("/transactions/{transaction_id}/allocations")
def replace_allocations(
    transaction_id: UUID, body: AllocationsReplace, db: DbDep
) -> TransactionOut:
    """Sets which budget items a transaction counts toward (e.g. assigning from the inbox)."""
    txn = db.conn.execute(queries["get_transaction"], {"transaction_id": transaction_id}).fetchone()
    if txn is None:
        raise not_found("transaction")
    db.conn.execute(queries["delete_transaction_allocations"], {"transaction_id": transaction_id})
    write_allocations(db, transaction_id, txn["amount"], body.allocations)
    return TransactionOut.model_validate(txn)


@router.post("/transactions/{transaction_id}/approve")
def approve_transaction(transaction_id: UUID, body: ApproveIn, db: DbDep) -> TransactionOut:
    row = db.conn.execute(
        queries["approve_transaction"], {"transaction_id": transaction_id, "amount": body.amount}
    ).fetchone()
    if row is None:
        raise not_found("pending transaction")
    params = {"transaction_id": transaction_id, "resolution": "done"}
    db.conn.execute(queries["resolve_place_entries"], params)
    return TransactionOut.model_validate(row)


@router.post("/transactions/{transaction_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_transaction(transaction_id: UUID, db: DbDep) -> None:
    """Discards a pending transaction. Its rule won't generate that date again."""
    txn = db.conn.execute(queries["get_transaction"], {"transaction_id": transaction_id}).fetchone()
    if txn is None or txn["status"] != "pending":
        raise not_found("pending transaction")
    db.conn.execute(queries["delete_transaction"], {"transaction_id": transaction_id})
    params = {"transaction_id": transaction_id, "resolution": "rejected"}
    db.conn.execute(queries["resolve_place_entries"], params)


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
