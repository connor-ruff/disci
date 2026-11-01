from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

Name = Annotated[str, Field(min_length=1, max_length=200)]
Notes = Annotated[str, Field(max_length=300)]


class _Trimmed(BaseModel):
    """Names are trimmed; blank notes become null."""

    @field_validator("name", check_fields=False)
    @classmethod
    def _trim_name(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("can't be blank")
        return v.strip()

    @field_validator("notes", check_fields=False)
    @classmethod
    def _trim_notes(cls, v: str | None) -> str | None:
        return (v or "").strip() or None


# --- Types ---------------------------------------------------------------------------


class ShoppingTypeIn(_Trimmed):
    name: Annotated[str, Field(min_length=1, max_length=100)]


class ShoppingTypeOut(BaseModel):
    id: UUID
    name: str
    sort_order: int


class Order(BaseModel):
    ids: list[UUID] = Field(description="Every id, in the new order.")


# --- List items ----------------------------------------------------------------------


class _ItemFields(_Trimmed):
    name: Name
    shopping_type_id: UUID | None = Field(default=None, description="Null = Uncategorized.")
    notes: Notes | None = None


class ItemCreate(_ItemFields):
    save_as_common: bool = Field(
        default=False, description="Also save it as a common item (skipped if one exists)."
    )


class ItemUpdate(_ItemFields):
    """All editable fields, sent in full."""


class ItemOut(BaseModel):
    id: UUID
    shopping_type_id: UUID | None
    name: str
    notes: str | None
    sort_order: int
    done: bool = Field(description="Crossed off. Stays on the list until removed.")
    done_at: datetime | None


class DoneIn(BaseModel):
    done: bool


class ClearDone(BaseModel):
    all_types: bool = Field(default=False, description="Clear every type's crossed-off items.")
    shopping_type_id: UUID | None = Field(
        default=None, description="Otherwise this type's (null = Uncategorized)."
    )


class Cleared(BaseModel):
    removed: int


# --- Common items --------------------------------------------------------------------


class CommonIn(_ItemFields):
    pass


class CommonOut(BaseModel):
    id: UUID
    shopping_type_id: UUID | None
    name: str
    notes: str | None
    on_list: bool = Field(
        description="An item with the same name and type is on the list, not crossed off."
    )
