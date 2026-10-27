"""Tasks tools. Thin wrappers over the API's /tasks endpoints (docs/api/api-overview.md
§7.3), shaped for an assistant: read everything, and log check-offs. Nothing else writes
(by design, for now: tasks are created and edited in the app)."""

import asyncio
from datetime import date
from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from pydantic import Field

from disci_mcp import api
from disci_mcp.common import READ, WRITE


def _task(t: dict[str, Any]) -> dict[str, Any]:
    """A task with only the fields its type uses."""
    out: dict[str, Any] = {"id": t["id"], "name": t["name"]}
    if t["description"]:
        out["description"] = t["description"]
    kind = t["task_type"]
    if kind == "daily_checklist":
        out |= {"done_today": t["done_on_day"], "daily_target": t["daily_target"]}
    elif kind == "nondaily_maintenance":
        out |= {"every": f"{t['repeat_every']} {t['repeat_unit']}(s)", "next_due": t["next_due"]}
    elif kind == "adhoc_to_do":
        out["due"] = t["next_due"]
    if kind != "keep_in_mind":
        out |= {"done": t["done"], "last_done_on": t["last_done_on"]}
    if t["due_status"]:
        out |= {"due_status": t["due_status"], "days_until_due": t["days_until_due"]}
    return out


def register(mcp: FastMCP) -> None:
    @mcp.tool(annotations=READ)
    async def get_tasks() -> dict[str, Any]:
        """Every active task, grouped by kind, with today's progress, plus what each kind
        means. Use for "what's on my list today?", "what's overdue?", or to find a task's id
        before logging it.

        Kinds: daily_checklist (habits done every day, once or `daily_target` times; resets
        each day), nondaily_maintenance (upkeep due again an interval after it's done),
        adhoc_to_do (one-time; a done one shows today only), keep_in_mind (reminders,
        nothing to check off). `due_status` is overdue / due_today / upcoming against the
        due date; `days_until_due` is negative when overdue. Dates are in the user's
        timezone.
        """
        types, tasks = await asyncio.gather(api.get("/tasks/types"), api.get("/tasks"))
        return {
            "kinds": {t["key"]: f"{t['name']}: {t['how_it_works']}" for t in types},
            "tasks": {
                t["key"]: [_task(x) for x in tasks if x["task_type"] == t["key"]] for t in types
            },
        }

    @mcp.tool(annotations=WRITE)
    async def log_task_completion(
        task_id: str,
        times: Annotated[int, Field(ge=1, le=50)] = 1,
        on_date: date | None = None,
    ) -> dict[str, Any]:
        """Log that the user did a task. Find its id with get_tasks first.

        Args:
            task_id: The task's id.
            times: Daily checklist only: how many check-offs to add (e.g. 3 of 5 sets).
                Other kinds are done once per call.
            on_date: The day they did it (YYYY-MM-DD), if not today; never in the future.

        Daily: adds to that day's count (it may pass the target). Maintenance: next due
        becomes on_date plus its interval. To-do: marked done. Keep-in-mind tasks can't be
        logged. Returns the task as it now stands.
        """
        if times > 1:
            current = await api.get(f"/tasks/{task_id}")
            if current["task_type"] != "daily_checklist":
                raise ToolError("Only daily checklist tasks take times > 1; log it once.")
        body = {"on": on_date.isoformat() if on_date else None}
        task: dict[str, Any] = {}
        for i in range(times):
            try:
                task = await api.post(f"/tasks/{task_id}/complete", body)
            except ToolError as e:
                if i == 0:
                    raise
                raise ToolError(f"Logged {i} of {times}, then: {e}") from e
        return {"task_type": task["task_type"], **_task(task)}
