import datetime as dt
from decimal import Decimal
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

WorkoutType = Literal["run", "walk", "bike", "lift"]
Miles = Annotated[Decimal, Field(gt=0, max_digits=6, decimal_places=2)]
Pounds = Annotated[Decimal, Field(ge=0, max_digits=6, decimal_places=2)]
LiftName = Annotated[str, Field(min_length=1, max_length=100)]


class SetIn(BaseModel):
    """One set. Name the lift by `lift_id`, or by `lift_name` (found case-insensitively in
    the catalog, or added to it)."""

    lift_id: UUID | None = None
    lift_name: LiftName | None = None
    reps: int = Field(ge=1, le=1000)
    weight_num: Pounds | None = Field(default=None, description="Pounds; null = bodyweight.")

    @model_validator(mode="after")
    def _one_lift(self) -> "SetIn":
        if (self.lift_id is None) == (self.lift_name is None or not self.lift_name.strip()):
            raise ValueError("give exactly one of lift_id or lift_name")
        return self


class SetOut(BaseModel):
    set_number: int = Field(description="1, 2, 3… across the whole workout, in the order done.")
    lift_id: UUID
    lift_name: str
    reps: int
    weight_num: Pounds | None


class WorkoutIn(BaseModel):
    """A workout, sent in full. Fields a type doesn't use must be left out: lifts have no
    miles, elevation or heart rate; only lifts have sets."""

    type: WorkoutType
    date: dt.date | None = Field(
        default=None, description="The day it counts toward (default today); not in the future."
    )
    location: Annotated[str, Field(max_length=100)] | None = Field(
        default=None, description='Free text, e.g. "Hoboken", "Treadmill", "Home gym".'
    )
    miles: Miles | None = Field(default=None, description="Required for runs and walks.")
    time_in_sec: int | None = Field(default=None, gt=0, le=86_400 * 2)
    elevation_gain_ft: int | None = Field(default=None, ge=0, le=100_000)
    avg_heart_rate: int | None = Field(default=None, ge=20, le=250)
    description: Annotated[str, Field(max_length=300)] | None = Field(
        default=None, description='General; for a lift, the body parts ("back/chest").'
    )
    reflection: Annotated[str, Field(max_length=5000)] | None = None
    sets: list[SetIn] = Field(
        default=[], max_length=200, description="Lifts only, in the order done."
    )


class WorkoutOut(BaseModel):
    id: UUID
    type: WorkoutType
    date: dt.date
    location: str | None
    miles: Miles | None
    time_in_sec: int | None
    elevation_gain_ft: int | None
    avg_heart_rate: int | None
    description: str | None
    reflection: str | None
    pace_sec_per_mile: int | None = Field(
        description="time_in_sec / miles, rounded; null without both."
    )
    sets: list[SetOut]
    created_at: dt.datetime


class LiftIn(BaseModel):
    name: LiftName
    description: Annotated[str, Field(max_length=300)] | None = None


class SetSummary(BaseModel):
    reps: int
    weight_num: Pounds | None


class LiftOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    last_done_on: dt.date | None = Field(description="The latest workout it was in.")
    last_sets: list[SetSummary] = Field(description='Its sets that time ("last time").')


class LiftSession(BaseModel):
    workout_id: UUID
    date: dt.date
    sets: list[SetSummary]


class LiftDetail(LiftOut):
    sessions: list[LiftSession] = Field(description="Newest first, up to 50.")


# ---------------------------------------------------------------------------
# Plans
# ---------------------------------------------------------------------------

PlanNote = Annotated[str, Field(max_length=200)]
WeekStatus = Literal["none", "upcoming", "in_progress", "under", "in_range", "over"]


class PlanDayIn(BaseModel):
    day_on: dt.date
    planned_miles: Miles
    notes: PlanNote | None = Field(default=None, description='e.g. "long run", "tempo".')


class PlanDayOut(PlanDayIn):
    pass


class PlanWeekIn(BaseModel):
    week_starts_on: dt.date
    target_miles: Miles


class PlanIn(BaseModel):
    """A plan's details and rule settings (not its days), sent in full."""

    name: Annotated[str, Field(min_length=1, max_length=100)]
    race_name: Annotated[str, Field(max_length=100)] | None = None
    race_on: dt.date | None = Field(default=None, description="Race day, for days to race.")
    starts_on: dt.date = Field(description="The plan's first day.")
    count_walk_miles: bool = Field(
        default=False, description="Walk miles count toward weekly miles and % complete."
    )
    cross_train_at_pct: int = Field(
        default=90,
        ge=1,
        le=200,
        description="Once weekly miles reach this % of the week's target, suggest "
        "cross-training instead of another run (90 = the bottom of the ±10% band).",
    )


class PlanCreate(PlanIn):
    days: list[PlanDayIn] = Field(default=[], max_length=2000)
    weeks: list[PlanWeekIn] = Field(default=[], max_length=300)
    active: bool = Field(default=True, description="Make it the active plan (the old one isn't).")


class PlanOut(PlanIn):
    id: UUID
    is_active: bool
    ends_on: dt.date | None = Field(description="The race day, or else the last planned day.")
    total_miles: Decimal = Field(description="All planned days added up.")
    day_count: int = Field(description="Days with miles planned.")


class PlanDetail(PlanOut):
    days: list[PlanDayOut]
    weeks: list[PlanWeekIn] = Field(description="Weekly targets set by hand.")


class PlanDaysIn(BaseModel):
    """Every planned day, replacing the plan's current ones (e.g. a fresh import)."""

    days: list[PlanDayIn] = Field(max_length=2000)


class PlanWeekEdit(BaseModel):
    """One week of a plan, replacing what it had: its days (all inside the week) and its
    target (null = the sum of the days)."""

    days: list[PlanDayIn] = Field(max_length=7)
    target_miles: Miles | None = None


class ActiveIn(BaseModel):
    active: bool


class GridIn(BaseModel):
    text: Annotated[str, Field(max_length=200_000)] = Field(
        description="Rows of: week start date, then Monday..Sunday miles; tab- or comma-separated."
    )


class GridOut(BaseModel):
    days: list[PlanDayOut]
    weeks: int = Field(description="Rows read.")
    total_miles: Decimal
    skipped: list[str] = Field(description="Rows and cells that couldn't be read.")


class WeekOut(BaseModel):
    starts_on: dt.date
    target_miles: Miles | None = Field(description="Set target, or the sum of the planned days.")
    target_is_set: bool = Field(description="The target was set by hand (plan_weeks).")
    band_low: Decimal | None = Field(description="Target − 10%.")
    band_high: Decimal | None = Field(description="Target + 10%.")
    miles_done: Decimal = Field(description="Run miles, plus walks if the plan counts them.")
    runs_done: int
    runs_planned: int = Field(description="Days with miles planned.")
    status: WeekStatus
    cross_train: bool = Field(
        description="Weekly miles reached the plan's cross_train_at_pct of the target."
    )


class CalendarOut(BaseModel):
    today: dt.date
    plan: PlanOut | None = Field(description="The active plan, if any.")
    days_to_race: int | None
    days: list[PlanDayOut] = Field(description="The active plan's days in the range.")
    weeks: list[WeekOut] = Field(description="Every week overlapping the range.")
