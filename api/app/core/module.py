from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import APIRouter
from psycopg import Connection

ModuleSetup = Callable[[Connection[dict[str, Any]], UUID], None]


@dataclass(frozen=True)
class Module:
    """What a module registers with the app (see app/modules/__init__.py).

    `key` matches the module's Postgres schema, its web folder and
    core.user_modules.module_key.
    """

    key: str
    name: str
    description: str
    router: APIRouter
    # Runs once, in the same transaction, the first time a user enables the module
    # (e.g. seeding default categories). Never runs on re-enable.
    setup: ModuleSetup | None = None
