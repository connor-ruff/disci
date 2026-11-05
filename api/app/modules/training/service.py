"""Training rules that don't belong in SQL: which fields each workout type uses, and pace."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from app.modules.training.schemas import WorkoutIn

# Fields a lift can't have (also enforced by CHECKs on training.workouts).
NOT_FOR_LIFTS = ("miles", "elevation_gain_ft", "avg_heart_rate")
# Types that must have a distance.
NEEDS_MILES = ("run", "walk")


def check_fields(body: WorkoutIn) -> None:
    """Raises ValueError (→ 422) when a field doesn't fit the workout's type."""
    if body.type == "lift":
        used = [f for f in NOT_FOR_LIFTS if getattr(body, f) is not None]
        if used:
            raise ValueError(f"a lift has no {', '.join(used)}")
    else:
        if body.sets:
            raise ValueError("only a lift has sets")
        if body.type in NEEDS_MILES and body.miles is None:
            raise ValueError(f"a {body.type} needs miles")


def clean_text(value: str | None) -> str | None:
    """Trimmed; blank becomes null."""
    if value is None:
        return None
    value = value.strip()
    return value or None


def pace(row: dict[str, Any]) -> int | None:
    """Seconds per mile, rounded, when the workout has both time and miles."""
    miles, seconds = row.get("miles"), row.get("time_in_sec")
    if not miles or not seconds:
        return None
    return int((Decimal(seconds) / Decimal(miles)).quantize(Decimal(1), rounding=ROUND_HALF_UP))
