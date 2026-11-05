import datetime as dt

import psycopg
import pytest
from fastapi.testclient import TestClient

from tests.conftest import OWNER_URL, as_user

ALICE = as_user("alice")
BOB = as_user("bob")


def log(client: TestClient, headers=ALICE, **body) -> dict:
    resp = client.post("/training/workouts", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def lift_sets(*rows: tuple[str, int, float | None]) -> list[dict]:
    return [{"lift_name": n, "reps": r, "weight_num": w} for n, r, w in rows]


def test_run_needs_miles_and_gets_a_pace(client: TestClient) -> None:
    bad = client.post("/training/workouts", json={"type": "run"}, headers=ALICE)
    assert bad.status_code == 422
    assert "needs miles" in bad.json()["detail"]

    run = log(
        client,
        type="run",
        miles="5",
        time_in_sec=2930,
        location=" Hoboken ",
        avg_heart_rate=147,
        elevation_gain_ft=40,
        reflection="  Easy and steady. ",
    )
    assert run["miles"] == "5.00"
    assert run["pace_sec_per_mile"] == 586
    assert run["location"] == "Hoboken"
    assert run["reflection"] == "Easy and steady."
    assert run["sets"] == []


def test_time_is_optional_and_bike_needs_nothing(client: TestClient) -> None:
    walk = log(client, type="walk", miles="2")
    assert walk["time_in_sec"] is None
    assert walk["pace_sec_per_mile"] is None
    bike = log(client, type="bike")
    assert bike["miles"] is None


def test_fields_must_fit_the_type(client: TestClient) -> None:
    lift_with_miles = client.post(
        "/training/workouts", json={"type": "lift", "miles": "1"}, headers=ALICE
    )
    assert lift_with_miles.status_code == 422
    run_with_sets = client.post(
        "/training/workouts",
        json={"type": "run", "miles": "3", "sets": lift_sets(("Squat", 5, 225))},
        headers=ALICE,
    )
    assert run_with_sets.status_code == 422


def test_date_defaults_to_today_and_cant_be_in_the_future(client: TestClient) -> None:
    today = dt.date.today()
    w = log(client, type="bike")
    # The user's timezone defaults to one near UTC's date; allow a day either way.
    assert abs((dt.date.fromisoformat(w["date"]) - today).days) <= 1
    future = (today + dt.timedelta(days=3)).isoformat()
    resp = client.post("/training/workouts", json={"type": "bike", "date": future}, headers=ALICE)
    assert resp.status_code == 422


def test_lift_sets_build_the_catalog_and_keep_their_order(client: TestClient) -> None:
    w = log(
        client,
        type="lift",
        description="Push",
        sets=lift_sets(
            ("Bench press", 5, 185),
            ("Bench press", 5, 185),
            ("bench press", 4, 185),
            ("Dip", 10, None),
        ),
    )
    assert [s["set_number"] for s in w["sets"]] == [1, 2, 3, 4]
    assert [s["lift_name"] for s in w["sets"]] == ["Bench press"] * 3 + ["Dip"]
    assert w["sets"][3]["weight_num"] is None

    lifts = client.get("/training/lifts", headers=ALICE).json()
    assert sorted(lift["name"] for lift in lifts) == ["Bench press", "Dip"]
    bench = next(lift for lift in lifts if lift["name"] == "Bench press")
    assert bench["last_done_on"] == w["date"]
    assert [(s["reps"], s["weight_num"]) for s in bench["last_sets"]] == [
        (5, "185.00"),
        (5, "185.00"),
        (4, "185.00"),
    ]

    # By id works too, and an unknown id is a 422.
    again = log(
        client,
        type="lift",
        date="2026-01-01",
        sets=[{"lift_id": bench["id"], "reps": 8, "weight_num": 135}],
    )
    assert again["sets"][0]["lift_name"] == "Bench press"
    unknown = client.post(
        "/training/workouts",
        json={"type": "lift", "sets": [{"lift_id": w["id"], "reps": 1}]},
        headers=ALICE,
    )
    assert unknown.status_code == 422


def test_last_time_is_the_latest_workout_by_date(client: TestClient) -> None:
    log(client, type="lift", date="2026-10-01", sets=lift_sets(("Squat", 5, 205)))
    log(client, type="lift", date="2026-10-08", sets=lift_sets(("Squat", 5, 215)))
    log(client, type="lift", date="2026-09-01", sets=lift_sets(("Squat", 5, 195)))
    squat = client.get("/training/lifts", headers=ALICE).json()[0]
    assert squat["last_done_on"] == "2026-10-08"
    detail = client.get(f"/training/lifts/{squat['id']}", headers=ALICE).json()
    assert [s["date"] for s in detail["sessions"]] == ["2026-10-08", "2026-10-01", "2026-09-01"]


def test_editing_replaces_sets_and_can_change_type(client: TestClient) -> None:
    w = log(client, type="lift", sets=lift_sets(("Squat", 5, 225), ("Squat", 5, 225)))
    edited = client.put(
        f"/training/workouts/{w['id']}",
        json={"type": "lift", "date": w["date"], "sets": lift_sets(("Deadlift", 3, 275))},
        headers=ALICE,
    ).json()
    assert [(s["lift_name"], s["set_number"]) for s in edited["sets"]] == [("Deadlift", 1)]

    as_run = client.put(
        f"/training/workouts/{w['id']}",
        json={"type": "run", "date": w["date"], "miles": "3.1"},
        headers=ALICE,
    )
    assert as_run.status_code == 200, as_run.text
    assert as_run.json()["sets"] == []


def test_sets_can_only_belong_to_a_lift_in_the_database(client: TestClient) -> None:
    w = log(client, type="lift", sets=lift_sets(("Squat", 5, 225)))
    with psycopg.connect(OWNER_URL) as conn, pytest.raises(psycopg.errors.ForeignKeyViolation):
        conn.execute("UPDATE training.workouts SET type = 'bike' WHERE id = %s", (w["id"],))


def test_list_filters_and_order(client: TestClient) -> None:
    log(client, type="run", miles="3", date="2026-10-01")
    log(client, type="lift", date="2026-10-03")
    log(client, type="walk", miles="2", date="2026-10-05")
    log(client, type="run", miles="4", date="2026-11-01")

    def dates(**params) -> list[str]:
        resp = client.get("/training/workouts", params=params, headers=ALICE)
        return [w["date"] for w in resp.json()]

    assert dates() == ["2026-11-01", "2026-10-05", "2026-10-03", "2026-10-01"]
    assert dates(start="2026-10-02", end="2026-10-31") == ["2026-10-05", "2026-10-03"]
    assert dates(type="run") == ["2026-11-01", "2026-10-01"]
    assert dates(limit=1, offset=1) == ["2026-10-05"]


def test_delete_and_locations(client: TestClient) -> None:
    a = log(client, type="run", miles="3", date="2026-10-01", location="Mahwah")
    log(client, type="run", miles="3", date="2026-10-04", location="Hoboken")
    log(client, type="lift", date="2026-10-02", location="Home gym")
    assert client.get("/training/locations", headers=ALICE).json() == [
        "Hoboken",
        "Home gym",
        "Mahwah",
    ]
    assert client.delete(f"/training/workouts/{a['id']}", headers=ALICE).status_code == 204
    assert client.get(f"/training/workouts/{a['id']}", headers=ALICE).status_code == 404
    assert client.delete(f"/training/workouts/{a['id']}", headers=ALICE).status_code == 404
    assert "Mahwah" not in client.get("/training/locations", headers=ALICE).json()


def test_lift_catalog_crud(client: TestClient) -> None:
    resp = client.post("/training/lifts", json={"name": " Squat "}, headers=ALICE)
    assert resp.status_code == 201
    squat = resp.json()
    assert squat["name"] == "Squat" and squat["last_done_on"] is None
    assert client.post("/training/lifts", json={"name": "squat"}, headers=ALICE).status_code == 409
    assert client.post("/training/lifts", json={"name": "  "}, headers=ALICE).status_code == 422

    renamed = client.put(
        f"/training/lifts/{squat['id']}", json={"name": "Back squat"}, headers=ALICE
    )
    assert renamed.json()["name"] == "Back squat"

    w = log(client, type="lift", sets=[{"lift_id": squat["id"], "reps": 5, "weight_num": 225}])
    assert client.delete(f"/training/lifts/{squat['id']}", headers=ALICE).status_code == 204
    assert client.get("/training/lifts", headers=ALICE).json() == []
    # The workout still shows the deleted lift's sets under its name.
    kept = client.get(f"/training/workouts/{w['id']}", headers=ALICE).json()
    assert kept["sets"][0]["lift_name"] == "Back squat"
    # And the name is free to use again.
    assert (
        client.post("/training/lifts", json={"name": "Back squat"}, headers=ALICE).status_code
        == 201
    )


def test_users_only_see_their_own(client: TestClient) -> None:
    w = log(client, type="lift", sets=lift_sets(("Squat", 5, 225)))
    squat = client.get("/training/lifts", headers=ALICE).json()[0]
    assert client.get("/training/workouts", headers=BOB).json() == []
    assert client.get("/training/lifts", headers=BOB).json() == []
    assert client.get(f"/training/workouts/{w['id']}", headers=BOB).status_code == 404
    assert client.delete(f"/training/workouts/{w['id']}", headers=BOB).status_code == 404
    stolen = client.post(
        "/training/workouts",
        json={"type": "lift", "sets": [{"lift_id": squat["id"], "reps": 5}]},
        headers=BOB,
    )
    assert stolen.status_code == 422
