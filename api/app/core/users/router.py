from fastapi import APIRouter

from app.core.db import DbDep
from app.core.sql import Queries
from app.core.users.schemas import UserOut, UserUpdate

queries = Queries(__file__)
router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
def get_me(db: DbDep) -> UserOut:
    row = db.conn.execute(queries["get_user"], {"user_id": db.user_id}).fetchone()
    return UserOut.model_validate(row)


@router.put("")
def update_me(body: UserUpdate, db: DbDep) -> UserOut:
    row = db.conn.execute(
        queries["update_user"], {"user_id": db.user_id, **body.model_dump()}
    ).fetchone()
    return UserOut.model_validate(row)
