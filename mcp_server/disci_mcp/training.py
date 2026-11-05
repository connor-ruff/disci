"""Training tools. Thin wrappers over the API's /training endpoints
(docs/api/api-overview.md §7.5), shaped for an assistant: log a workout (with lift sets),
read recent workouts, look up what was lifted last time, and delete a mistaken entry.
Logging a set by lift name adds new lifts to the user's catalog."""

from typing import Annotated, Any, Literal

from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp.exceptions import ToolError
from pydantic import BaseModel, Field

from disci_mcp import api
from disci_mcp.common import DESTRUCTIVE, READ, WRITE, num


class LiftSet(BaseModel):
    lift: Annotated[str, Field(min_length=1, max_length=100)] = Field(
        description='The lift\'s name, e.g. "Bench press" (any case). A new name is added to '
        "the user's lift catalog."
    )
    reps: int = Field(ge=1, le=1000)
    weight_lb: float | None = Field(
        default=None, ge=0, description="Pounds. Leave out for bodyweight (pull-ups, dips)."
    )


def _clock(seconds: int) -> str:
    """2930 -> "48:50"; 7260 -> "2:01:00"."""
    h, rest = divmod(seconds, 3600)
    m, s = divmod(rest, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _sets_text(sets: list[dict[str, Any]]) -> list[str]:
    return [
        f"{num(s['weight_num'])} × {s['reps']}"
        if s["weight_num"] is not None
        else f"BW × {s['reps']}"
        for s in sets
    ]


def _lifts(sets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sets grouped by lift, in the order the lifts were done."""
    out: list[dict[str, Any]] = []
    for s in sets:
        if not out or out[-1]["lift"] != s["lift_name"]:
            out.append({"lift": s["lift_name"], "sets": []})
        out[-1]["sets"] += _sets_text([s])
    return out


def _workout(w: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {"id": w["id"], "date": w["date"], "type": w["type"]}
    if w["miles"] is not None:
        out["miles"] = num(w["miles"])
    if w["time_in_sec"]:
        out["time"] = _clock(w["time_in_sec"])
    if w["pace_sec_per_mile"]:
        out["pace_per_mile"] = _clock(w["pace_sec_per_mile"])
    for key in ("location", "elevation_gain_ft", "avg_heart_rate", "description", "reflection"):
        if w[key] is not None:
            out[key] = w[key]
    if w["sets"]:
        out["lifts"] = _lifts(w["sets"])
    return out


def register(mcp: FastMCP) -> None:
    @mcp.tool(annotations=WRITE)
    async def log_workout(
        type: Literal["run", "walk", "bike", "lift"],
        date: str | None = None,
        miles: float | None = None,
        minutes: float | None = None,
        location: str | None = None,
        avg_heart_rate: int | None = None,
        elevation_gain_ft: int | None = None,
        description: str | None = None,
        reflection: str | None = None,
        sets: list[LiftSet] | None = None,
    ) -> dict[str, Any]:
        """Log a workout: a run, walk, bike ride or lifting session.

        Runs and walks need `miles`; everything else is optional. Lifts have no miles,
        heart rate or elevation; give their `sets` in the order done (one entry per set,
        e.g. three entries for "bench 185 for 3 sets of 5"), and the body parts or split in
        `description` ("Push", "back/chest"). `reflection` is the user's own words on how it
        went; keep it as they said it.

        Args:
            date: YYYY-MM-DD, default today. Not in the future.
            minutes: Duration, e.g. 48.5 for 48:30.
            location: Free text, e.g. "Hoboken", "Treadmill", "Home gym".
        """
        body = {
            "type": type,
            "date": date,
            "miles": miles,
            "time_in_sec": round(minutes * 60) if minutes else None,
            "location": location,
            "avg_heart_rate": avg_heart_rate,
            "elevation_gain_ft": elevation_gain_ft,
            "description": description,
            "reflection": reflection,
            "sets": [
                {"lift_name": s.lift, "reps": s.reps, "weight_num": s.weight_lb} for s in sets or []
            ],
        }
        return _workout(await api.post("/training/workouts", body))

    @mcp.tool(annotations=READ)
    async def list_workouts(
        start: str | None = None,
        end: str | None = None,
        type: Literal["run", "walk", "bike", "lift"] | None = None,
        limit: int = 30,
    ) -> dict[str, Any]:
        """The user's workouts, newest first, with lift sets grouped by lift.

        Use for "what did I do this week?", "how many miles did I run in October?" or
        to find a workout's id. Weights are pounds; "BW" is bodyweight.

        Args:
            start: YYYY-MM-DD, on or after.
            end: YYYY-MM-DD, on or before.
            limit: At most this many (1-200).
        """
        params = {"start": start, "end": end, "type": type, "limit": max(1, min(limit, 200))}
        rows = await api.get(
            "/training/workouts", {k: v for k, v in params.items() if v is not None}
        )
        return {"workouts": [_workout(w) for w in rows]}

    @mcp.tool(annotations=READ)
    async def get_lift_history(lift: str, sessions: int = 10) -> dict[str, Any]:
        """What the user lifted for one lift, most recent first: answers "what did I bench
        last time?" or "how has my squat gone up?".

        Args:
            lift: The lift's name, e.g. "Bench press" (any case).
            sessions: How many past workouts to return (1-50).
        """
        lifts = await api.get("/training/lifts")
        match = next((x for x in lifts if x["name"].lower() == lift.strip().lower()), None)
        if match is None:
            known = ", ".join(x["name"] for x in lifts) or "none yet"
            raise ToolError(f'No lift "{lift}". The user\'s lifts: {known}.')
        detail = await api.get(f"/training/lifts/{match['id']}")
        return {
            "lift": detail["name"],
            "sessions": [
                {"date": s["date"], "sets": _sets_text(s["sets"])}
                for s in detail["sessions"][: max(1, min(sessions, 50))]
            ],
        }

    @mcp.tool(annotations=DESTRUCTIVE)
    async def delete_workout(workout_id: str) -> dict[str, Any]:
        """Delete a logged workout (e.g. one logged by mistake), with its sets. Find the id
        with list_workouts."""
        await api.delete(f"/training/workouts/{workout_id}")
        return {"deleted": workout_id}
