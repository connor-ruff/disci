from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from app.modules.tasks.service import add_interval
from tests.conftest import as_user

ALICE = as_user("alice")
BOB = as_user("bob")


@pytest.fixture
def today(client: TestClient) -> date:
    """Today in Alice's timezone (also creates her user row)."""
    me = client.get("/me", headers=ALICE).json()
    return datetime.now(ZoneInfo(me["timezone"])).date()


def add(client: TestClient, headers=ALICE, **body) -> dict:
    resp = client.post("/tasks", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def check(client: TestClient, task: dict, on: date | None = None, headers=ALICE):
    body = {"on": on.isoformat()} if on else None
    return client.post(f"/tasks/{task['id']}/complete", json=body, headers=headers)


def undo(client: TestClient, task: dict, on: date | None = None):
    body = {"on": on.isoformat()} if on else None
    return client.post(f"/tasks/{task['id']}/undo", json=body, headers=ALICE)


def listed(client: TestClient, on: date | None = None) -> dict[str, dict]:
    params = {"on": on.isoformat()} if on else {}
    return {t["name"]: t for t in client.get("/tasks", params=params, headers=ALICE).json()}


def test_types_are_fixed_and_described(client: TestClient) -> None:
    types = client.get("/tasks/types", headers=ALICE).json()
    assert [t["key"] for t in types] == [
        "daily_checklist", "nondaily_maintenance", "adhoc_to_do", "keep_in_mind",
    ]  # fmt: skip
    assert all(t["summary"] and t["how_it_works"] and t["examples"] for t in types)
    bad = {"task_type": "someday", "name": "x"}
    assert client.post("/tasks", json=bad, headers=ALICE).status_code == 422


def test_each_type_keeps_only_its_fields(client: TestClient, today: date) -> None:
    extras = {"repeat_every": 2, "repeat_unit": "week", "next_due": "2026-11-08", "daily_target": 5}
    daily = add(client, task_type="daily_checklist", name="Jaw exercises", **extras)
    assert (daily["daily_target"], daily["repeat_every"], daily["next_due"]) == (5, None, None)

    keep = add(client, task_type="keep_in_mind", name="Say please", **extras)
    assert (keep["daily_target"], keep["repeat_unit"], keep["next_due"]) == (None, None, None)

    todo = add(client, task_type="adhoc_to_do", name="Return Black Wave", **extras)
    assert todo["next_due"] == "2026-11-08"
    assert (todo["repeat_every"], todo["daily_target"]) == (None, None)

    # Defaults: a daily target of 1; maintenance first due today.
    assert add(client, task_type="daily_checklist", name="Brita")["daily_target"] == 1
    sheets = add(client, task_type="nondaily_maintenance", name="Sheets", repeat_every=2,
                 repeat_unit="week")  # fmt: skip
    assert sheets["next_due"] == today.isoformat()
    assert sheets["due_status"] == "due_today"

    resp = client.post("/tasks", json={"task_type": "nondaily_maintenance", "name": "x"},
                       headers=ALICE)  # fmt: skip
    assert resp.status_code == 422
    assert "repeat_every, repeat_unit" in resp.json()["detail"]


def test_daily_checklist_counts_up_and_resets_each_day(client: TestClient, today: date) -> None:
    jaw = add(client, task_type="daily_checklist", name="Jaw exercises", daily_target=3)
    yesterday = today - timedelta(days=1)
    for _ in range(3):
        check(client, jaw, on=yesterday)
    assert listed(client, yesterday)["Jaw exercises"]["done"]

    # Today starts at zero, whatever happened yesterday.
    assert listed(client)["Jaw exercises"]["done_on_day"] == 0
    for _ in range(2):
        task = check(client, jaw).json()
    assert (task["done_on_day"], task["done"]) == (2, False)
    task = check(client, jaw).json()
    assert (task["done_on_day"], task["done"]) == (3, True)

    # Undo takes back today's latest only; with none left today, there's nothing to undo.
    for _ in range(3):
        assert undo(client, jaw).status_code == 200
    assert undo(client, jaw).status_code == 404
    assert listed(client, yesterday)["Jaw exercises"]["done_on_day"] == 3


def test_maintenance_is_next_due_an_interval_after_it_was_done(
    client: TestClient, today: date
) -> None:
    week_ago = today - timedelta(days=7)
    sheets = add(client, task_type="nondaily_maintenance", name="Sheets", repeat_every=2,
                 repeat_unit="week", next_due=(today - timedelta(days=3)).isoformat())  # fmt: skip
    assert (sheets["due_status"], sheets["days_until_due"]) == ("overdue", -3)

    # Done late (today): next due two weeks from today, not from the old due date.
    task = check(client, sheets).json()
    assert task["next_due"] == (today + timedelta(weeks=2)).isoformat()
    assert task["done"] and task["due_status"] == "upcoming"
    assert task["last_done_on"] == today.isoformat()

    # Undo restores the old due date.
    task = undo(client, sheets).json()
    assert task["next_due"] == (today - timedelta(days=3)).isoformat()
    assert task["last_done_on"] is None

    # Done on a past day counts from that day.
    task = check(client, sheets, on=week_ago).json()
    assert task["next_due"] == add_interval(week_ago, 2, "week").isoformat()

    detail = client.get(f"/tasks/{sheets['id']}", headers=ALICE).json()
    assert [c["completed_on"] for c in detail["recent_completions"]] == [week_ago.isoformat()]
    assert detail["recent_completions"][0]["due_on"] == (today - timedelta(days=3)).isoformat()


def test_todo_is_done_once_and_stays_crossed_off_for_the_day(
    client: TestClient, today: date
) -> None:
    flights = add(client, task_type="adhoc_to_do", name="Book flights",
                  next_due=(today - timedelta(days=1)).isoformat())  # fmt: skip
    assert listed(client)["Book flights"]["due_status"] == "overdue"

    task = check(client, flights).json()
    assert task["done"] and task["due_status"] is None  # done isn't overdue
    assert check(client, flights).status_code == 409
    assert listed(client)["Book flights"]["done"]  # still shown today
    assert "Book flights" not in listed(client, today + timedelta(days=1))  # gone tomorrow

    undo(client, flights)
    assert not listed(client, today + timedelta(days=1))["Book flights"]["done"]


def test_rules_for_checking_off(client: TestClient, today: date) -> None:
    keep = add(client, task_type="keep_in_mind", name="Read more")
    assert check(client, keep).status_code == 422
    daily = add(client, task_type="daily_checklist", name="Pill")
    assert check(client, daily, on=today + timedelta(days=1)).status_code == 422


def test_editing_keeps_the_type_and_deleting_keeps_history(client: TestClient, today: date) -> None:
    daily = add(client, task_type="daily_checklist", name="Pushups", daily_target=10)
    check(client, daily)
    body = {"name": " Pushups (sets) ", "daily_target": 5, "next_due": "2026-12-01"}
    task = client.put(f"/tasks/{daily['id']}", json=body, headers=ALICE).json()
    assert (task["name"], task["daily_target"], task["next_due"]) == ("Pushups (sets)", 5, None)
    assert task["task_type"] == "daily_checklist"

    assert client.delete(f"/tasks/{daily['id']}", headers=ALICE).status_code == 204
    assert "Pushups (sets)" not in listed(client)
    done = client.get("/tasks/completions", headers=ALICE).json()
    assert [(c["task_name"], c["completed_on"]) for c in done] == [
        ("Pushups (sets)", today.isoformat())
    ]
    assert client.get(f"/tasks/{daily['id']}", headers=ALICE).status_code == 404


def test_users_only_see_their_own_tasks(client: TestClient, today: date) -> None:
    task = add(client, task_type="adhoc_to_do", name="Alice's")
    client.get("/me", headers=BOB)
    assert client.get("/tasks", headers=BOB).json() == []
    assert client.get(f"/tasks/{task['id']}", headers=BOB).status_code == 404
    assert check(client, task, headers=BOB).status_code == 404
    assert client.get("/tasks/completions", headers=BOB).json() == []


@pytest.mark.parametrize(
    ("start", "every", "unit", "expected"),
    [
        (date(2026, 10, 27), 3, "day", date(2026, 10, 30)),
        (date(2026, 10, 27), 2, "week", date(2026, 11, 10)),
        (date(2026, 1, 31), 1, "month", date(2026, 2, 28)),
        (date(2026, 11, 30), 1, "quarter", date(2027, 2, 28)),
        (date(2024, 2, 29), 1, "year", date(2025, 2, 28)),
        (date(2026, 12, 15), 13, "month", date(2028, 1, 15)),
    ],
)
def test_add_interval(start: date, every: int, unit, expected: date) -> None:
    assert add_interval(start, every, unit) == expected
