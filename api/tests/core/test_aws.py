"""The production-only code paths, exercised locally."""

import psycopg
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core import rds_iam
from app.core.auth import Identity, get_identity
from app.core.rds_iam import IamAuthConnection
from app.core.settings import Settings

MCP_CLIENT = "mcp-client-id"
COGNITO = Settings(
    env="prod", auth_mode="cognito", database_url="postgresql://x", mcp_client_id=MCP_CLIENT
)


def gateway_request(claims: dict[str, str] | None) -> Request:
    """A request as Mangum builds it from an API Gateway event."""
    authorizer = {"jwt": {"claims": claims}} if claims is not None else {}
    event = {"requestContext": {"authorizer": authorizer}}
    return Request({"type": "http", "headers": [], "aws.event": event})


def test_cognito_identity_comes_from_verified_claims() -> None:
    claims = {"sub": "abc-123", "email": "me@example.com", "token_use": "id"}
    identity = get_identity(gateway_request(claims), COGNITO)
    assert identity == Identity(sub="abc-123", email="me@example.com")


def test_cognito_accepts_mcp_access_token_without_email() -> None:
    claims = {"sub": "abc-123", "token_use": "access", "client_id": MCP_CLIENT}
    identity = get_identity(gateway_request(claims), COGNITO)
    assert identity == Identity(sub="abc-123", email=None)


def test_cognito_rejects_mcp_access_token_when_mcp_not_configured() -> None:
    claims = {"sub": "abc-123", "token_use": "access", "client_id": MCP_CLIENT}
    settings = COGNITO.model_copy(update={"mcp_client_id": None})
    with pytest.raises(HTTPException) as exc:
        get_identity(gateway_request(claims), settings)
    assert exc.value.status_code == 401


@pytest.mark.parametrize(
    "claims",
    [
        None,  # route without the authorizer
        {"sub": "abc", "token_use": "access", "client_id": "web-client"},  # not the MCP client
        {"sub": "abc", "token_use": "access"},  # access token without a client_id
        {"sub": "abc", "token_use": "id"},  # no email
    ],
)
def test_cognito_rejects_missing_or_unusable_claims(claims: dict[str, str] | None) -> None:
    with pytest.raises(HTTPException) as exc:
        get_identity(gateway_request(claims), COGNITO)
    assert exc.value.status_code == 401


def test_cognito_mode_ignores_dev_header() -> None:
    request = Request({"type": "http", "headers": [(b"x-dev-user", b"attacker")]})
    with pytest.raises(HTTPException):
        get_identity(request, COGNITO)


def test_iam_connection_uses_token_as_password(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []

    def fake_token(host: str, port: int, user: str) -> str:
        calls.append((host, port, user))
        return "disci_api"  # the local role's password stands in for a signed token

    monkeypatch.setattr(rds_iam, "rds_auth_token", fake_token)
    url = "postgresql://disci_api@localhost:5432/disci_test"
    with IamAuthConnection.connect(url) as conn:
        assert conn.execute("SELECT current_user").fetchone() == ("disci_api",)
    assert calls == [("localhost", 5432, "disci_api")]


def test_iam_connection_fails_without_valid_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rds_iam, "rds_auth_token", lambda **_: "wrong")
    with pytest.raises(psycopg.OperationalError):
        IamAuthConnection.connect("postgresql://disci_api@localhost:5432/disci_test")
