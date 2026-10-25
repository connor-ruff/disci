from uuid import UUID
from zoneinfo import available_timezones

from pydantic import BaseModel, Field, field_validator


class UserOut(BaseModel):
    id: UUID
    email: str
    display_name: str | None
    timezone: str
    week_starts_on: int


class UserUpdate(BaseModel):
    """The user's editable settings. Sent in full (PUT semantics)."""

    display_name: str | None = Field(default=None, max_length=100)
    timezone: str
    week_starts_on: int = Field(ge=1, le=7, description="ISO day: 1 = Monday ... 7 = Sunday")

    @field_validator("timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        if value not in available_timezones():
            raise ValueError(f"unknown IANA timezone: {value}")
        return value
