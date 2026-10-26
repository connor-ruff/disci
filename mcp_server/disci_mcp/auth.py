import logging
from functools import cache

import jwt
from jwt import PyJWKClient
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken

log = logging.getLogger(__name__)


@cache
def _jwks(issuer: str) -> PyJWKClient:
    # Module-level cache, so a warm Lambda reuses the fetched signing keys.
    return PyJWKClient(f"{issuer}/.well-known/jwks.json")


class CognitoVerifier:
    """Verifies the Cognito access token Claude sends with every MCP request.

    Checks the signature (pool JWKS, RS256), expiry, issuer, token_use and that it was
    issued to the disci-mcp client. Cognito access tokens have no `aud`, so the client is
    checked through `client_id` instead.
    """

    def __init__(self, issuer: str, client_id: str) -> None:
        self.issuer = issuer
        self.client_id = client_id

    async def verify_token(self, token: str) -> AccessToken | None:
        try:
            key = _jwks(self.issuer).get_signing_key_from_jwt(token).key
            claims = jwt.decode(
                token, key, algorithms=["RS256"], issuer=self.issuer, options={"verify_aud": False}
            )
        except jwt.PyJWTError as e:
            log.info("token rejected: %s", e)
            return None
        if claims.get("token_use") != "access" or claims.get("client_id") != self.client_id:
            log.info("token rejected: token_use or client_id mismatch")
            return None
        return AccessToken(
            token=token,
            client_id=claims["client_id"],
            scopes=claims.get("scope", "").split(),
            expires_at=claims.get("exp"),
            subject=claims["sub"],
            claims=claims,
        )


def caller_token() -> str | None:
    """The verified access token of the request being handled (None in dev mode)."""
    token = get_access_token()
    return token.token if token else None
