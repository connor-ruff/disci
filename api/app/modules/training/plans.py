"""Training plan rules: reading a pasted plan grid, and scoring a week against its target.

These are the rules the calendar, the dashboard and (later) the training brief share, so
they're defined once, here. See docs/db/training.md §4.
"""

import datetime as dt
import re
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

# The weekly band: target ± 10%.
BAND = Decimal("0.10")
CENTS = Decimal("0.01")

WeekStatus = Literal["none", "upcoming", "in_progress", "under", "in_range", "over"]

# ---------------------------------------------------------------------------
# The grid: week start date, then Monday..Sunday miles (as copied from a spreadsheet)
# ---------------------------------------------------------------------------

_DATE_FORMATS = ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y", "%b %d, %Y", "%B %d, %Y")
_REST = {"", "-", "–", "0", "0.0", "rest", "off", "x"}
_MILES = re.compile(r"^(\d+(?:\.\d+)?)\s*(?:mi|miles?)?\b\s*[-–:,]?\s*(.*)$", re.IGNORECASE)


@dataclass
class GridDay:
    day_on: dt.date
    planned_miles: Decimal
    notes: str | None


@dataclass
class Grid:
    days: list[GridDay] = field(default_factory=list)
    weeks: int = 0
    skipped: list[str] = field(default_factory=list)


def _parse_date(text: str) -> dt.date | None:
    for fmt in _DATE_FORMATS:
        try:
            return dt.datetime.strptime(text.strip(), fmt).date()
        except ValueError:
            continue
    return None


def parse_grid(text: str) -> Grid:
    """Reads rows of `week start date, day 1 miles, …, day 7 miles`, separated by tabs (a
    spreadsheet copy) or commas. Day i is the week start date + i. A blank, 0, "-" or
    "rest" cell is a rest day (no row). A cell may add a note after the number ("6 long
    run"). Rows whose first cell isn't a date (headers) and cells that aren't a number are
    skipped and reported. Cells after the seventh (e.g. a Total column) are ignored. A day
    given twice keeps the later value.
    """
    grid = Grid()
    by_day: dict[dt.date, GridDay] = {}
    for line in text.splitlines():
        if not line.strip():
            continue
        cells = line.split("\t") if "\t" in line else line.split(",")
        start = _parse_date(cells[0])
        if start is None:
            grid.skipped.append(f"Row skipped (no week start date): {line.strip()[:60]}")
            continue
        grid.weeks += 1
        for i, raw in enumerate(cells[1:8]):
            cell = raw.strip()
            if cell.lower() in _REST:
                continue
            day = start + dt.timedelta(days=i)
            match = _MILES.match(cell)
            if match is None:
                grid.skipped.append(f"{day.isoformat()}: not a number of miles ({cell[:30]})")
                continue
            miles = Decimal(match.group(1)).quantize(CENTS)
            if miles <= 0:
                continue
            if miles >= Decimal("10000"):
                grid.skipped.append(f"{day.isoformat()}: too many miles ({cell[:30]})")
                continue
            notes = match.group(2).strip()[:200] or None
            by_day[day] = GridDay(day, miles, notes)
    grid.days = sorted(by_day.values(), key=lambda d: d.day_on)
    return grid


# ---------------------------------------------------------------------------
# Weeks: target, band and status
# ---------------------------------------------------------------------------


def week_start(day: dt.date, week_starts_on: int) -> dt.date:
    """The first day of the week holding `day`; weeks start on ISO weekday `week_starts_on`."""
    return day - dt.timedelta(days=(day.isoweekday() - week_starts_on) % 7)


def _cents(value: Decimal) -> Decimal:
    return value.quantize(CENTS, rounding=ROUND_HALF_UP)


@dataclass
class WeekScore:
    starts_on: dt.date
    target_miles: Decimal | None
    target_is_set: bool
    band_low: Decimal | None
    band_high: Decimal | None
    miles_done: Decimal
    runs_done: int
    runs_planned: int
    status: WeekStatus
    cross_train: bool


def score_week(
    starts_on: dt.date,
    *,
    today: dt.date,
    planned: list[Decimal],
    set_target: Decimal | None,
    workouts: list[dict[str, Any]],
    count_walk_miles: bool,
    cross_train_at_pct: int,
    has_plan: bool,
) -> WeekScore:
    """One week against its plan.

    - Miles done: the week's run miles, plus walk miles when the plan counts them.
    - Target: the week's set target (plan_weeks) if any, else the sum of its planned days.
    - Band: target ± 10%. Status for a finished week: under / in_range / over. The current
      week is over or in_range as soon as it gets there, else in_progress. Later weeks
      are upcoming. Without a plan (or a target) the status is none.
    - Cross-train: weekly miles have reached `cross_train_at_pct`% of the target, so the
      suggestion is bike, walk or lift instead of another run.
    """
    counted = {"run", "walk"} if count_walk_miles else {"run"}
    miles = sum(
        (Decimal(w["miles"]) for w in workouts if w["type"] in counted and w["miles"] is not None),
        Decimal(0),
    )
    runs = sum(1 for w in workouts if w["type"] == "run")
    target = set_target if set_target is not None else (sum(planned, Decimal(0)) or None)
    if not has_plan or target is None:
        return WeekScore(starts_on, None, False, None, None, _cents(miles), runs, 0, "none", False)

    low, high = _cents(target * (1 - BAND)), _cents(target * (1 + BAND))
    ends_on = starts_on + dt.timedelta(days=6)
    status: WeekStatus
    if starts_on > today:
        status = "upcoming"
    elif miles > high:
        status = "over"
    elif miles >= low:
        status = "in_range"
    else:
        status = "under" if ends_on < today else "in_progress"
    cross_train = starts_on <= today and miles >= target * Decimal(cross_train_at_pct) / 100
    return WeekScore(
        starts_on, _cents(target), set_target is not None, low, high, _cents(miles), runs,
        len(planned), status, cross_train,
    )  # fmt: skip
