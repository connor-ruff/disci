"""Finance tools. Thin wrappers over the API's /finance endpoints (docs/api/api-overview.md
§7.1), shaped for an assistant: one call answers one question."""

import asyncio
from datetime import date
from decimal import Decimal
from typing import Annotated, Any, Literal

from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, Field

from disci_mcp import api
from disci_mcp.common import DESTRUCTIVE, READ, WRITE, each

Positive = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


def _remaining(planned: str, actual: str) -> str:
    return str(Decimal(planned) - Decimal(actual))


def _totals(t: dict[str, str]) -> dict[str, str]:
    return {**t, "remaining": _remaining(t["planned"], t["actual"])}


def _summary(budget: dict[str, Any], on_date: date) -> dict[str, Any]:
    start = date.fromisoformat(budget["period_start"])
    end = date.fromisoformat(budget["period_end"])
    return {
        "id": budget["id"],
        "name": budget["name"],
        "period_type": budget["period_type"],
        "period_start": budget["period_start"],
        "period_end": budget["period_end"],
        "days_in_period": (end - start).days + 1,
        "days_elapsed": (on_date - start).days + 1,  # counting on_date itself
        "income": _totals(budget["income"]),
        "expense": _totals(budget["expense"]),
        "items": [
            {
                "id": i["id"],
                "kind": i["kind"],
                "name": i["name"],
                "category": i["category_name"],
                "planned": i["planned_amount"],
                "actual": i["actual_amount"],
                "pending": i["pending_amount"],
                "remaining": _remaining(i["planned_amount"], i["actual_amount"]),
            }
            for i in budget["items"]
        ],
    }


def _transaction(t: dict[str, Any]) -> dict[str, Any]:
    out = {
        k: t[k]
        for k in ("id", "kind", "amount", "occurred_on", "payee", "description", "notes", "status")
    }
    if "allocations" in t:
        out["counts_toward"] = [
            {k: a[k] for k in ("budget_item_id", "budget_item_name", "budget_name", "amount")}
            for a in t["allocations"]
        ]
    if t.get("recurring_name"):
        out["recurring_name"] = t["recurring_name"]
    return out


def _allocations(item_ids: list[str], amount: Decimal) -> list[dict[str, str]]:
    # The whole amount counts toward each item: one purchase can count in a monthly and a
    # weekly budget at once. (Within one budget, allocations can't exceed the amount.)
    return [{"budget_item_id": i, "amount": str(amount)} for i in item_ids]


class Approval(BaseModel):
    transaction_id: str
    amount: Positive | None = Field(
        default=None, description="Corrected amount, only if it differs from the rule's."
    )


def register(mcp: FastMCP) -> None:
    @mcp.tool(annotations=READ)
    async def get_budget_summary(on_date: date | None = None) -> dict[str, Any]:
        """Summarize the user's budget(s) covering a date: planned vs actual income and
        expenses, and every budget item with what's left.

        Use for questions like "how am I doing on my budget?" or "how much is left for
        groceries this month?", and to find the budget item ids to log a transaction to.

        Args:
            on_date: Any date in the period (YYYY-MM-DD). Defaults to today in the
                user's timezone.

        Amounts are strings in dollars. `actual` counts confirmed transactions only;
        `pending` is awaiting the user's approval. `remaining` = planned - actual (for an
        expense, negative means over budget; for income, it is what's still expected).
        `days_elapsed` counts on_date itself, out of `days_in_period`. A date can be
        covered by several budgets (e.g. a monthly and a weekly one).
        """
        if on_date is None:
            on_date = await api.today()

        budgets = await api.get("/finance/budgets")
        day = on_date.isoformat()
        covering = [b for b in budgets if b["period_start"] <= day <= b["period_end"]]
        details = await asyncio.gather(*(api.get(f"/finance/budgets/{b['id']}") for b in covering))

        result: dict[str, Any] = {"date": day, "budgets": [_summary(d, on_date) for d in details]}
        if not covering:
            result["note"] = "No budget covers this date."
            result["recent_budgets"] = [
                {k: b[k] for k in ("name", "period_type", "period_start", "period_end")}
                for b in budgets[:5]
            ]
        return result

    @mcp.tool(annotations=WRITE)
    async def log_transaction(
        amount: Positive,
        budget_item_ids: list[str] | None = None,
        payee: str | None = None,
        description: str | None = None,
        occurred_on: date | None = None,
        kind: Literal["expense", "income"] = "expense",
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Record a purchase or income the user tells you about.

        First look up the budget items with get_budget_summary and tell the user which
        item(s) you'll count it toward; log it once they agree.

        Args:
            amount: Dollars, positive (e.g. 69.12), for expenses and income alike.
            budget_item_ids: Budget items it counts toward; the whole amount counts toward
                each. Pick at most one item per budget (e.g. "Groceries" in the monthly
                budget and "Food" in the weekly one). Empty leaves it unassigned.
            payee: Who was paid or who paid, e.g. "Trader Joe's".
            description: What it was for, if useful.
            occurred_on: YYYY-MM-DD. Defaults to today in the user's timezone.
            kind: "expense" (default) or "income".
            notes: Longer free text, rarely needed.
        """
        body = {
            "kind": kind,
            "amount": str(amount),
            "occurred_on": (occurred_on or await api.today()).isoformat(),
            "payee": payee,
            "description": description,
            "notes": notes,
            "allocations": _allocations(budget_item_ids or [], amount),
        }
        txn = await api.post("/finance/transactions", body)
        return _transaction(await api.get(f"/finance/transactions/{txn['id']}"))

    @mcp.tool(annotations=READ)
    async def list_budget_transactions(budget_id: str) -> dict[str, Any]:
        """List the transactions counted in one budget, newest first, with the item each
        counts toward. Use to find a transaction to fix or delete. Budget ids come from
        get_budget_summary.

        `allocated_amount` is the part of the transaction counted toward that item.
        """
        rows = await api.get(f"/finance/budgets/{budget_id}/transactions")
        keep = ("id", "kind", "amount", "occurred_on", "payee", "description", "status",
                "budget_item_name", "allocated_amount")  # fmt: skip
        return {"transactions": [{k: r[k] for k in keep} for r in rows]}

    @mcp.tool(annotations=WRITE)
    async def update_transaction(
        transaction_id: str,
        amount: Positive | None = None,
        budget_item_ids: list[str] | None = None,
        payee: str | None = None,
        description: str | None = None,
        occurred_on: date | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        """Fix a transaction: change only the fields you pass; the rest stay as they are.

        Args:
            transaction_id: From log_transaction, list_budget_transactions or
                get_transaction_inbox.
            amount: New amount in dollars. Items it counted toward in full follow it.
            budget_item_ids: Replaces the items it counts toward (whole amount each).
                Pass [] to unassign it.
            payee, description, occurred_on, notes: New values.
        """
        txn = await api.get(f"/finance/transactions/{transaction_id}")
        old_amount = Decimal(txn["amount"])
        new_amount = old_amount if amount is None else amount
        if budget_item_ids is not None:
            allocations = _allocations(budget_item_ids, new_amount)
        else:
            allocations = [
                {
                    "budget_item_id": a["budget_item_id"],
                    # A partial allocation keeps its amount (capped at the new total).
                    "amount": str(
                        new_amount
                        if Decimal(a["amount"]) == old_amount
                        else min(Decimal(a["amount"]), new_amount)
                    ),
                }
                for a in txn["allocations"]
            ]
        body = {
            "kind": txn["kind"],
            "amount": str(new_amount),
            "occurred_on": (occurred_on or date.fromisoformat(txn["occurred_on"])).isoformat(),
            "payee": txn["payee"] if payee is None else payee,
            "description": txn["description"] if description is None else description,
            "notes": txn["notes"] if notes is None else notes,
            "allocations": allocations,
        }
        return _transaction(await api.put(f"/finance/transactions/{transaction_id}", body))

    @mcp.tool(annotations=DESTRUCTIVE)
    async def delete_transaction(transaction_id: str) -> dict[str, Any]:
        """Delete a transaction (e.g. one logged by mistake). It stops counting toward
        every budget. Confirm with the user first."""
        await api.delete(f"/finance/transactions/{transaction_id}")
        return {"deleted": transaction_id}

    @mcp.tool(annotations=READ)
    async def get_transaction_inbox() -> dict[str, Any]:
        """Transactions needing the user's attention.

        `pending`: generated by recurring transactions (bills, paychecks) and waiting for
        approval; they don't count in `actual` until approved. `unassigned`: confirmed but
        not counted in any budget yet (assign them with update_transaction).
        """
        inbox = await api.get("/finance/inbox")
        return {
            "pending": [_transaction(t) for t in inbox["pending"]],
            "unassigned": [_transaction(t) for t in inbox["unassigned"]],
        }

    @mcp.tool(annotations=WRITE)
    async def approve_transactions(approvals: list[Approval]) -> dict[str, Any]:
        """Approve pending transactions (from get_transaction_inbox) so they count in
        their budgets. Only at the user's direction.

        Each approval may carry a corrected amount (e.g. this month's bill was higher).
        Returns one outcome per transaction.
        """
        results = await each(
            [a.transaction_id for a in approvals],
            [
                api.post(
                    f"/finance/transactions/{a.transaction_id}/approve",
                    {"amount": None if a.amount is None else str(a.amount)},
                )
                for a in approvals
            ],
        )
        return {"results": results}

    @mcp.tool(annotations=DESTRUCTIVE)
    async def reject_transactions(transaction_ids: list[str]) -> dict[str, Any]:
        """Reject pending transactions (from get_transaction_inbox): they are discarded,
        and their recurring rule won't generate that date again. Only at the user's
        direction. Returns one outcome per transaction."""
        results = await each(
            transaction_ids,
            [api.post(f"/finance/transactions/{t}/reject") for t in transaction_ids],
        )
        return {"results": [{k: v for k, v in r.items() if k != "result"} for r in results]}

    @mcp.tool(annotations=READ)
    async def get_monthly_checklist() -> dict[str, Any]:
        """The monthly checklist (bills and other must-dos) of the monthly budget covering
        today, by due day: what's done and what's left.

        An item is done once its confirmed actual reaches the planned amount.
        """
        rows = await api.get("/finance/checklist")
        items = [
            {
                "item_id": r["item_id"],
                "name": r["item_name"],
                "kind": r["kind"],
                "budget": r["budget_name"],
                "due_on": r["due_on"],
                "planned": r["planned_amount"],
                "actual": r["actual_amount"],
                "done": r["done"],
                "last_payment_on": r["last_payment_on"],
            }
            for r in rows
        ]
        done = sum(i["done"] for i in items)
        return {"done": done, "left": len(items) - done, "items": items}
