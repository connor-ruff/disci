import pytest
from mcp.server.fastmcp.exceptions import ToolError

from tests.conftest import FakeApi, call_tool

TYPES = [
    {"key": k, "name": k.title(), "summary": "s", "how_it_works": f"how {k}", "examples": []}
    for k in ("daily_checklist", "nondaily_maintenance", "adhoc_to_do", "keep_in_mind")
]


def task(id_: str, task_type: str, **fields) -> dict:
    return {
        "id": id_, "task_type": task_type, "name": id_, "description": None,
        "repeat_every": None, "repeat_unit": None, "next_due": None, "daily_target": None,
        "done_on_day": 0, "last_done_on": None, "done": False, "due_status": None,
        "days_until_due": None,
    } | fields  # fmt: skip


JAW = task("jaw", "daily_checklist", daily_target=5)
SHEETS = task("sheets", "nondaily_maintenance", repeat_every=2, repeat_unit="week",
              next_due="2026-10-24", due_status="overdue", days_until_due=-3)  # fmt: skip
PLEASE = task("please", "keep_in_mind")


@pytest.fixture
def tasks(fake_api: FakeApi) -> FakeApi:
    fake_api.routes |= {("GET", "/tasks/types"): TYPES, ("GET", "/tasks"): [JAW, SHEETS, PLEASE]}
    return fake_api


def test_get_tasks_groups_by_kind_with_only_relevant_fields(tasks: FakeApi) -> None:
    result = call_tool("get_tasks", {})
    assert result["kinds"]["keep_in_mind"] == "Keep_In_Mind: how keep_in_mind"
    assert result["tasks"]["adhoc_to_do"] == []
    assert result["tasks"]["daily_checklist"] == [
        {"id": "jaw", "name": "jaw", "done_today": 0, "daily_target": 5, "done": False,
         "last_done_on": None}
    ]  # fmt: skip
    [sheets] = result["tasks"]["nondaily_maintenance"]
    assert (sheets["every"], sheets["due_status"], sheets["days_until_due"]) == (
        "2 week(s)", "overdue", -3,
    )  # fmt: skip
    assert result["tasks"]["keep_in_mind"] == [{"id": "please", "name": "please"}]


def test_log_completion_repeats_for_partial_daily_progress(tasks: FakeApi) -> None:
    count = iter(range(1, 10))
    tasks.routes[("GET", "/tasks/jaw")] = JAW
    tasks.routes[("POST", "/tasks/jaw/complete")] = lambda body: JAW | {"done_on_day": next(count)}

    result = call_tool("log_task_completion", {"task_id": "jaw", "times": 3})
    assert result["done_today"] == 3
    assert tasks.sent("POST", "/tasks/jaw/complete") == [{"on": None}] * 3


def test_log_completion_on_a_past_day(tasks: FakeApi) -> None:
    done = SHEETS | {"next_due": "2026-11-09", "done": True, "last_done_on": "2026-10-26"}
    tasks.routes[("POST", "/tasks/sheets/complete")] = done
    result = call_tool("log_task_completion", {"task_id": "sheets", "on_date": "2026-10-26"})
    assert tasks.sent("POST", "/tasks/sheets/complete") == [{"on": "2026-10-26"}]
    assert result["next_due"] == "2026-11-09"


def test_times_is_for_daily_tasks_only(tasks: FakeApi) -> None:
    tasks.routes[("GET", "/tasks/sheets")] = SHEETS
    with pytest.raises(AssertionError, match="Only daily checklist tasks"):
        call_tool("log_task_completion", {"task_id": "sheets", "times": 2})
    assert tasks.sent("POST", "/tasks/sheets/complete") == []  # nothing written


def test_api_errors_come_through(tasks: FakeApi) -> None:
    def keep(body: dict) -> None:
        raise ToolError("Disci API error 422: keep-in-mind tasks aren't checked off")

    tasks.routes[("POST", "/tasks/please/complete")] = keep
    with pytest.raises(AssertionError, match="aren't checked off"):
        call_tool("log_task_completion", {"task_id": "please"})
