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

    claims = _gateway_jwt_claims(request)
    if claims is None or claims.get("token_use") != "id" or "email" not in claims:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return Identity(sub=claims["sub"], email=claims["email"])


def _gateway_jwt_claims(request: Request) -> dict[str, str] | None:
    """Claims from a Cognito ID token that API Gateway's JWT authorizer already verified
    (signature, expiry, issuer, audience) before invoking the Lambda.

    Mangum exposes the raw Lambda event as scope["aws.event"]. The Lambda can only be
    invoked through API Gateway, so these claims can't be forged by a client.
    """
    event = request.scope.get("aws.event") or {}
    return event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims")
