from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.db import DbDep
from app.core.module import Module
from app.core.sql import Queries
from app.modules import MODULES

queries = Queries(__file__)
router = APIRouter(prefix="/me/modules", tags=["me"])


class ModuleOut(BaseModel):
    key: str
    name: str
    description: str
    enabled: bool


def _out(module: Module, enabled: bool) -> ModuleOut:
    return ModuleOut(
        key=module.key, name=module.name, description=module.description, enabled=enabled
    )


def _get_module(key: str) -> Module:
    module = MODULES.get(key)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown module: {key}")
    return module


@router.get("")
def list_modules(db: DbDep) -> list[ModuleOut]:
    """Every available module, with whether the current user has it turned on."""
    rows = db.conn.execute(queries["list_user_modules"], {"user_id": db.user_id}).fetchall()
    enabled = {row["module_key"] for row in rows if row["disabled_at"] is None}
    return [_out(module, module.key in enabled) for module in MODULES.values()]


@router.put("/{key}")
def enable_module(key: str, db: DbDep) -> ModuleOut:
    module = _get_module(key)
    params = {"user_id": db.user_id, "module_key": key}
    existing = db.conn.execute(queries["get_user_module"], params).fetchone()

    if existing is None:
        db.conn.execute(queries["insert_user_module"], params)
        if module.setup is not None:
            module.setup(db.conn, db.user_id)
    elif existing["disabled_at"] is not None:
        db.conn.execute(queries["reenable_user_module"], params)

    return _out(module, enabled=True)


@router.delete("/{key}")
def disable_module(key: str, db: DbDep) -> ModuleOut:
    """Hides the module. Its data is kept and returns when it is re-enabled."""
    module = _get_module(key)
    db.conn.execute(queries["disable_user_module"], {"user_id": db.user_id, "module_key": key})
    return _out(module, enabled=False)
