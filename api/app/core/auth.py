from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.core.settings import Settings, get_settings

DEV_USER_HEADER = "X-Dev-User"
DEV_DEFAULT_SUB = "local-dev-user"


@dataclass(frozen=True)
class Identity:
    """Who is making the request, as asserted by the identity provider."""

    sub: str
    email: str


def get_identity(
    request: Request, settings: Annotated[Settings, Depends(get_settings)]
) -> Identity:
    if settings.auth_mode == "dev":
        # Local/test only (Settings refuses dev auth in prod). Acts as the seeded dev
        # user, or as any user named in the X-Dev-User header.
        sub = request.headers.get(DEV_USER_HEADER, DEV_DEFAULT_SUB)
        return Identity(sub=sub, email=f"{sub}@disci.local")

    # Cognito JWT verification arrives with the AWS infrastructure.
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "Cognito auth is not implemented yet")
