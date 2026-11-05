from fastapi.testclient import TestClient

from tests.conftest import as_user

ALICE = as_user("alice")
BOB = as_user("bob")

NYC = {"name": "NYC Marathon 2027", "race_name": "NYC Marathon", "race_on": "2027-11-07",
       "starts_on": "2026-10-26"}  # fmt: skip


def create(client: TestClient, headers=ALICE, **body) -> dict:
    resp = client.post("/training/plans", json=NYC | body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def day(on: str, miles: str, notes: str | None = None) -> dict:
    return {"day_on": on, "planned_miles": miles, "notes": notes}


def test_grid_preview_saves_nothing(client: TestClient) -> None:
    resp = client.post(
        "/training/plans/grid", json={"text": "10/26/2026\t\t3\t\t4\t\t6 long run\t"}, headers=ALICE
    )
    body = resp.json()
    assert (body["weeks"], body["total_miles"]) == (1, "13.00")
    assert body["days"][2] == {"day_on": "2026-10-31", "planned_miles": "6.00", "notes": "long run"}
    assert client.get("/training/plans", headers=ALICE).json() == []


def test_create_with_days_and_totals(client: TestClient) -> None:
    plan = create(client, days=[day("2026-10-27", "3"), day("2026-10-31", "6", " long run ")])
    assert plan["is_active"] is True
    assert (plan["total_miles"], plan["day_count"], plan["ends_on"]) == ("9.00", 2, "2027-11-07")
    assert plan["days"][1]["notes"] == "long run"
    assert plan["count_walk_miles"] is False and plan["cross_train_at_pct"] == 90

    repeat = client.post(
        "/training/plans", json=NYC | {"days": [day("2026-10-27", "3"), day("2026-10-27", "4")]},
        headers=ALICE,
    )  # fmt: skip
    assert repeat.status_code == 422
    assert (
        client.post("/training/plans", json=NYC | {"name": " "}, headers=ALICE).status_code == 422
    )


def test_one_active_plan_at_a_time(client: TestClient) -> None:
    old = create(client, name="Brooklyn Half")
    new = create(client)
    plans = client.get("/training/plans", headers=ALICE).json()
    assert [(p["name"], p["is_active"]) for p in plans] == [
        ("NYC Marathon 2027", True), ("Brooklyn Half", False),
    ]  # fmt: skip
    back = client.put(f"/training/plans/{old['id']}/active", json={"active": True}, headers=ALICE)
    assert back.json()["is_active"] is True
    assert client.get(f"/training/plans/{new['id']}", headers=ALICE).json()["is_active"] is False
    inactive = create(client, name="Someday", active=False)
    assert inactive["is_active"] is False


def test_update_details_and_rules(client: TestClient) -> None:
    plan = create(client, days=[day("2026-10-27", "3")])
    edited = client.put(
        f"/training/plans/{plan['id']}",
        json=NYC | {"count_walk_miles": True, "cross_train_at_pct": 100, "race_on": None},
        headers=ALICE,
    ).json()
    assert (edited["count_walk_miles"], edited["cross_train_at_pct"]) == (True, 100)
    assert edited["ends_on"] == "2026-10-27"  # no race day: the last planned day
    assert len(edited["days"]) == 1


def test_edit_one_week_and_replace_all_days(client: TestClient) -> None:
    plan = create(client, days=[day("2026-10-27", "3"), day("2026-11-03", "4")])
    week = client.put(
        f"/training/plans/{plan['id']}/weeks/2026-10-26",
        json={"days": [day("2026-10-28", "5", "tempo")], "target_miles": "12"},
        headers=ALICE,
    ).json()
    assert [(d["day_on"], d["planned_miles"]) for d in week["days"]] == [
        ("2026-10-28", "5.00"), ("2026-11-03", "4.00"),
    ]  # fmt: skip
    assert week["weeks"] == [{"week_starts_on": "2026-10-26", "target_miles": "12.00"}]

    outside = client.put(
        f"/training/plans/{plan['id']}/weeks/2026-10-26",
        json={"days": [day("2026-11-02", "5")]},
        headers=ALICE,
    )
    assert outside.status_code == 422

    replaced = client.put(
        f"/training/plans/{plan['id']}/days", json={"days": [day("2026-12-01", "8")]}, headers=ALICE
    ).json()
    assert [d["day_on"] for d in replaced["days"]] == ["2026-12-01"]
    assert len(replaced["weeks"]) == 1  # targets stay


def test_weeks_score_plan_vs_done(client: TestClient) -> None:
    client.put("/me", json={"display_name": None, "timezone": "UTC", "week_starts_on": 1},
               headers=ALICE)  # fmt: skip
    plan = create(
        client,
        days=[day("2026-10-27", "5"), day("2026-10-29", "6"), day("2026-10-31", "9")],  # 20
        weeks=[{"week_starts_on": "2026-10-19", "target_miles": "10"}],
    )
    for on, miles in [("2026-10-27", "5"), ("2026-10-29", "6.5"), ("2026-10-31", "12")]:
        client.post("/training/workouts", json={"type": "run", "date": on, "miles": miles},
                    headers=ALICE)  # fmt: skip
    client.post("/training/workouts", json={"type": "walk", "date": "2026-10-20", "miles": "12"},
                headers=ALICE)  # fmt: skip

    cal = client.get(
        "/training/weeks", params={"start": "2026-10-21", "end": "2026-11-01"}, headers=ALICE
    ).json()
    assert cal["plan"]["id"] == plan["id"]
    assert [w["starts_on"] for w in cal["weeks"]] == ["2026-10-19", "2026-10-26"]
    first, second = cal["weeks"]
    # Week 1: a set target of 10, but walks don't count (yet).
    assert (first["target_miles"], first["target_is_set"], first["miles_done"]) == (
        "10.00",
        True,
        "0.00",
    )
    assert first["status"] == "under"
    # Week 2: 23.5 against 20 (18–22): over.
    assert (second["target_miles"], second["miles_done"], second["status"]) == (
        "20.00",
        "23.50",
        "over",
    )
    assert (second["runs_done"], second["runs_planned"], second["cross_train"]) == (3, 3, True)
    assert [d["day_on"] for d in cal["days"]] == ["2026-10-27", "2026-10-29", "2026-10-31"]

    client.put(
        f"/training/plans/{plan['id']}", json=NYC | {"count_walk_miles": True}, headers=ALICE
    )
    cal = client.get(
        "/training/weeks", params={"start": "2026-10-19", "end": "2026-10-25"}, headers=ALICE
    ).json()
    assert (cal["weeks"][0]["miles_done"], cal["weeks"][0]["status"]) == ("12.00", "over")


def test_weeks_without_a_plan(client: TestClient) -> None:
    cal = client.get(
        "/training/weeks", params={"start": "2026-10-26", "end": "2026-11-01"}, headers=ALICE
    ).json()
    assert cal["plan"] is None and cal["days_to_race"] is None
    assert cal["weeks"][0]["status"] == "none"
    bad = client.get(
        "/training/weeks", params={"start": "2026-11-01", "end": "2026-10-01"}, headers=ALICE
    )
    assert bad.status_code == 422


def test_delete_and_isolation(client: TestClient) -> None:
    plan = create(client, days=[day("2026-10-27", "3")])
    assert client.get(f"/training/plans/{plan['id']}", headers=BOB).status_code == 404
    assert (
        client.put(
            f"/training/plans/{plan['id']}/active", json={"active": True}, headers=BOB
        ).status_code
        == 404
    )
    assert client.get("/training/plans", headers=BOB).json() == []
    assert client.delete(f"/training/plans/{plan['id']}", headers=ALICE).status_code == 204
    assert client.get("/training/plans", headers=ALICE).json() == []
    cal = client.get(
        "/training/weeks", params={"start": "2026-10-26", "end": "2026-11-01"}, headers=ALICE
    ).json()
    assert cal["plan"] is None
