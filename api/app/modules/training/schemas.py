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
