"""Finance tools. Thin wrappers over the API's /finance endpoints (docs/api/api-overview.md
§7.1), shaped for an assistant: one call answers one question."""

import asyncio
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations

from disci_mcp import api


def _remaining(planned: str, actual: str) -> str:
    return str(Decimal(planned) - Decimal(actual))


def _totals(t: dict[str, str]) -> dict[str, str]:
    return {**t, "remaining": _remaining(t["planned"], t["actual"])}


def _summary(budget: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": budget["id"],
        "name": budget["name"],
        "period_type": budget["period_type"],
        "period_start": budget["period_start"],
        "period_end": budget["period_end"],
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


def register(mcp: FastMCP) -> None:
    @mcp.tool(annotations=ToolAnnotations(readOnlyHint=True, openWorldHint=False))
    async def get_budget_summary(on_date: date | None = None) -> dict[str, Any]:
        """Summarize the user's budget(s) covering a date: planned vs actual income and
        expenses, and every budget item with what's left.

        Use for questions like "how am I doing on my budget?" or "how much is left for
        groceries this month?".

        Args:
            on_date: Any date in the period (YYYY-MM-DD). Defaults to today in the
                user's timezone.

        Amounts are strings in dollars. `actual` counts confirmed transactions only;
        `pending` is awaiting the user's approval. `remaining` = planned - actual (for an
        expense, negative means over budget; for income, it is what's still expected).
        A date can be covered by several budgets (e.g. a monthly and a weekly one).
        """
        if on_date is None:
            me = await api.get("/me")
            on_date = datetime.now(ZoneInfo(me["timezone"])).date()

        budgets = await api.get("/finance/budgets")
        day = on_date.isoformat()
        covering = [b for b in budgets if b["period_start"] <= day <= b["period_end"]]
        details = await asyncio.gather(*(api.get(f"/finance/budgets/{b['id']}") for b in covering))

        result: dict[str, Any] = {"date": day, "budgets": [_summary(d) for d in details]}
        if not covering:
            result["note"] = "No budget covers this date."
            result["recent_budgets"] = [
                {k: b[k] for k in ("name", "period_type", "period_start", "period_end")}
                for b in budgets[:5]
            ]
        return result
