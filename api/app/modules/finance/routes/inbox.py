from uuid import UUID

from fastapi import APIRouter, status

from app.core.db import Db, DbDep
from app.modules.finance.routes._common import invalid, not_found, write_allocations
from app.modules.finance.schemas import (
    AllocationIn,
    Inbox,
    InboxEntryOut,
    InboxResolve,
    InboxTransactionOut,
    TransactionDetail,
)
from app.modules.finance.sql import queries

router = APIRouter(prefix="/inbox")

LEDGER_SIZE = 50
TRANSACTION_FIELDS = (
    "kind", "amount", "occurred_on", "payee", "description", "notes", "status",
    "recurring_transaction_id", "recurring_name",
)  # fmt: skip


def _allocations(db: Db, transaction_id: UUID) -> list:
    return db.conn.execute(
        queries["list_transaction_allocations"], {"transaction_id": transaction_id}
    ).fetchall()


def _entry(db: Db, row) -> InboxEntryOut:
    transaction = {"id": row["transaction_id"], **{k: row[k] for k in TRANSACTION_FIELDS}}
    return InboxEntryOut.model_validate(
        {
            **row,
            "kind": row["entry_kind"],
            "transaction": transaction,
            "allocations": _allocations(db, row["transaction_id"])
            if row["entry_kind"] == "place"
            else [],
        }
    )


@router.get("")
def get_inbox(db: DbDep) -> Inbox:
    """What needs a decision (from recurring rules), transactions not counted in any
    budget, and a ledger of what recurring rules applied automatically."""
    open_rows = db.conn.execute(queries["list_inbox_open"]).fetchall()
    unassigned = db.conn.execute(queries["list_unassigned"]).fetchall()
    ledger = [
        _entry(db, r)
        for r in db.conn.execute(queries["list_inbox_ledger"], {"limit": LEDGER_SIZE}).fetchall()
    ]
    return Inbox(
        needs_you=[_entry(db, r) for r in open_rows],
        unassigned=[InboxTransactionOut.model_validate(r) for r in unassigned],
        ledger=ledger,
        unseen=sum(not e.seen for e in ledger),
    )


def _open_entry(db: Db, entry_id: UUID):
    row = db.conn.execute(queries["get_inbox_entry"], {"entry_id": entry_id}).fetchone()
    if row is None:
        raise not_found("open inbox entry")
    return row


def _resolve(db: Db, entry_id: UUID, resolution: str, budget_item_id: UUID | None = None):
    db.conn.execute(
        queries["resolve_inbox_entry"],
        {"entry_id": entry_id, "resolution": resolution, "budget_item_id": budget_item_id},
    )


@router.post("/{entry_id}/resolve")
def resolve_entry(entry_id: UUID, body: InboxResolve, db: DbDep) -> TransactionDetail:
    """place: approves the transaction (with `amount` if given) and makes it count in full
    toward `budget_item_ids`, replacing where it counted before. pick_item: makes it count
    toward the one item picked in the entry's budget. Returns the transaction."""
    entry = _open_entry(db, entry_id)
    transaction_id = entry["transaction_id"]

    if entry["entry_kind"] == "place":
        txn = db.conn.execute(
            queries["approve_transaction"],
            {"transaction_id": transaction_id, "amount": body.amount},
        ).fetchone()
        if txn is None:
            raise not_found("pending transaction")
        db.conn.execute(
            queries["delete_transaction_allocations"], {"transaction_id": transaction_id}
        )
        allocations = [
            AllocationIn(budget_item_id=i, amount=txn["amount"]) for i in body.budget_item_ids
        ]
        write_allocations(db, transaction_id, txn["amount"], allocations)
        _resolve(db, entry_id, "done")
    else:
        if body.amount is not None or len(body.budget_item_ids) != 1:
            raise invalid("pick exactly one budget item (and no amount)")
        (item_id,) = body.budget_item_ids
        item = db.conn.execute(queries["get_budget_item"], {"item_id": item_id}).fetchone()
        if item is None or item["budget_id"] != entry["budget_id"]:
            raise invalid(f"pick an item in {entry['budget_name']}")
        if any(a["budget_id"] == entry["budget_id"] for a in _allocations(db, transaction_id)):
            raise invalid(f"it already counts in {entry['budget_name']}")
        allocation = AllocationIn(budget_item_id=item_id, amount=entry["amount"])
        write_allocations(db, transaction_id, entry["amount"], [allocation])
        _resolve(db, entry_id, "done", item_id)

    txn = db.conn.execute(queries["get_transaction"], {"transaction_id": transaction_id}).fetchone()
    return TransactionDetail.model_validate(
        {**txn, "allocations": _allocations(db, transaction_id)}
    )


@router.post("/{entry_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_entry(entry_id: UUID, db: DbDep) -> None:
    """place: rejects the transaction (discarded; its rule won't generate that date again).
    pick_item: skips that budget; the transaction still counts wherever else it landed."""
    entry = _open_entry(db, entry_id)
    if entry["entry_kind"] == "place":
        db.conn.execute(queries["delete_transaction"], {"transaction_id": entry["transaction_id"]})
        _resolve(db, entry_id, "rejected")
    else:
        _resolve(db, entry_id, "skipped")


@router.post("/seen", status_code=status.HTTP_204_NO_CONTENT)
def mark_seen(db: DbDep) -> None:
    """Marks every ledger entry as seen."""
    db.conn.execute(queries["mark_inbox_seen"])
