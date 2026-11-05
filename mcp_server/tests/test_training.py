import pytest
from mcp.server.fastmcp.exceptions import ToolError

from tests.conftest import FakeApi, call_tool


def workout(**overrides) -> dict:
    base = {"id": "w1", "type": "run", "date": "2026-11-04", "location": None, "miles": None,
            "time_in_sec": None, "elevation_gain_ft": None, "avg_heart_rate": None,
            "description": None, "reflection": None, "pace_sec_per_mile": None, "sets": [],
            "created_at": "2026-11-04T12:00:00Z"}  # fmt: skip
    return base | overrides


def lift_set(n: int, name: str, reps: int, weight: str | None) -> dict:
    return {"set_number": n, "lift_id": f"l-{name}", "lift_name": name, "reps": reps,
            "weight_num": weight}  # fmt: skip


PUSH = workout(
    id="w2", type="lift", description="Push", time_in_sec=3300,
    sets=[lift_set(1, "Bench press", 5, "185.00"), lift_set(2, "Bench press", 4, "185.00"),
          lift_set(3, "Dip", 10, None)],
)  # fmt: skip


def test_log_run_converts_minutes_and_shapes_the_result(fake_api: FakeApi) -> None:
    fake_api.routes[("POST", "/training/workouts")] = lambda body: workout(
        miles="5.00", time_in_sec=body["time_in_sec"], pace_sec_per_mile=586,
        location=body["location"],
    )  # fmt: skip
    result = call_tool(
        "log_workout", {"type": "run", "miles": 5, "minutes": 48.83, "location": "Hoboken"}
    )
    sent = fake_api.sent("POST", "/training/workouts")[0]
    assert sent["time_in_sec"] == 2930
    assert sent["sets"] == []
    assert result == {"id": "w1", "date": "2026-11-04", "type": "run", "miles": "5",
                      "time": "48:50", "pace_per_mile": "9:46", "location": "Hoboken"}  # fmt: skip


def test_log_lift_sends_sets_by_name_and_groups_them_back(fake_api: FakeApi) -> None:
    fake_api.routes[("POST", "/training/workouts")] = lambda body: PUSH
    result = call_tool(
        "log_workout",
        {"type": "lift", "description": "Push",
         "sets": [{"lift": "Bench press", "reps": 5, "weight_lb": 185},
                  {"lift": "Bench press", "reps": 4, "weight_lb": 185},
                  {"lift": "Dip", "reps": 10}]},
    )  # fmt: skip
    sent = fake_api.sent("POST", "/training/workouts")[0]["sets"]
    assert sent[2] == {"lift_name": "Dip", "reps": 10, "weight_num": None}
    assert result["lifts"] == [
        {"lift": "Bench press", "sets": ["185 × 5", "185 × 4"]},
        {"lift": "Dip", "sets": ["BW × 10"]},
    ]
    assert result["time"] == "55:00"


def test_list_workouts_passes_only_given_filters(
    fake_api: FakeApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    from disci_mcp import api

    fake_api.routes[("GET", "/training/workouts")] = [PUSH]
    seen: list = []

    async def spy(method, path, params=None, body=None):
        seen.append(params)
        return await fake_api.request(method, path, params, body)

    monkeypatch.setattr(api, "request", spy)
    result = call_tool("list_workouts", {"type": "lift", "limit": 500})
    assert seen == [{"type": "lift", "limit": 200}]
    assert result["workouts"][0]["description"] == "Push"


def test_lift_history_finds_the_lift_by_name(fake_api: FakeApi) -> None:
    fake_api.routes |= {
        ("GET", "/training/lifts"): [{"id": "l1", "name": "Bench press"}],
        ("GET", "/training/lifts/l1"): {
            "name": "Bench press",
            "sessions": [
                {"date": "2026-11-02", "sets": [{"reps": 5, "weight_num": "185.00"}]},
                {"date": "2026-10-26", "sets": [{"reps": 5, "weight_num": "180.00"}]},
            ],
        },
    }
    result = call_tool("get_lift_history", {"lift": "bench PRESS", "sessions": 1})
    assert result == {
        "lift": "Bench press",
        "sessions": [{"date": "2026-11-02", "sets": ["185 × 5"]}],
    }

    with pytest.raises(AssertionError, match='No lift "Squat"'):
        call_tool("get_lift_history", {"lift": "Squat"})


def test_delete_workout(fake_api: FakeApi) -> None:
    fake_api.routes[("DELETE", "/training/workouts/w1")] = None
    assert call_tool("delete_workout", {"workout_id": "w1"}) == {"deleted": "w1"}


def test_api_errors_come_back_as_tool_errors(fake_api: FakeApi) -> None:
    def refuse(body):
        raise ToolError("a run needs miles")

    fake_api.routes[("POST", "/training/workouts")] = refuse
    with pytest.raises(AssertionError, match="needs miles"):
        call_tool("log_workout", {"type": "run"})
