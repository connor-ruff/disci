from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from app.core.settings import Settings, get_settings

DEV_USER_HEADER = "X-Dev-User"
DEV_DEFAULT_SUB = "local-dev-user"


@dataclass(frozen=True)
class Identity:
    """Who is making the request, as asserted by the identity provider.

    `email` is None for MCP requests: Cognito access tokens carry no email, so those
    requests can only act as a user who already exists (see core/db.py).
    """

    sub: str
    email: str | None


def get_identity(
    request: Request, settings: Annotated[Settings, Depends(get_settings)]
) -> Identity:
    if settings.auth_mode == "dev":
        # Local/test only (Settings refuses dev auth in prod). Acts as the seeded dev
        # user, or as any user named in the X-Dev-User header.
        sub = request.headers.get(DEV_USER_HEADER, DEV_DEFAULT_SUB)
        return Identity(sub=sub, email=f"{sub}@disci.local")

    claims = gateway_jwt_claims(request)
    if claims is None or "sub" not in claims:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    # The web app sends ID tokens. The MCP server forwards the access token Claude got
    # from the disci-mcp client; only that client's access tokens are accepted.
    if claims.get("token_use") == "id" and "email" in claims:
        return Identity(sub=claims["sub"], email=claims["email"])
    if (
        claims.get("token_use") == "access"
        and settings.mcp_client_id is not None
        and claims.get("client_id") == settings.mcp_client_id
    ):
        return Identity(sub=claims["sub"], email=None)
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")


def gateway_jwt_claims(request: Request) -> dict[str, str] | None:
    """Claims from a Cognito token that API Gateway's JWT authorizer already verified
    (signature, expiry, issuer, and audience for ID tokens / client_id for access tokens)
    before invoking the Lambda.

    Mangum exposes the raw Lambda event as scope["aws.event"]. The Lambda can only be
    invoked through API Gateway, so these claims can't be forged by a client.
    """
    event = request.scope.get("aws.event") or {}
    return event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims")
