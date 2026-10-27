from mcp.server.auth.settings import AuthSettings
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette

from disci_mcp import finance, nutrition
from disci_mcp.auth import CognitoVerifier
from disci_mcp.request_log import RequestLog
from disci_mcp.settings import Settings, get_settings

INSTRUCTIONS = """\
Disci is the user's personal life manager. These tools read and change the user's own
Disci data. Amounts of money are strings in dollars. Dates are YYYY-MM-DD; "today" means
today in the user's timezone. Before changing anything, tell the user what you're about to
write (e.g. which budget item a purchase counts toward) unless they already said so."""


def build_mcp(settings: Settings) -> FastMCP:
    auth: dict = {}
    if settings.auth_mode == "cognito":
        assert settings.cognito_issuer and settings.cognito_client_id  # noqa: S101  # validated
        auth = {
            "token_verifier": CognitoVerifier(settings.cognito_issuer, settings.cognito_client_id),
            "auth": AuthSettings(
                issuer_url=settings.cognito_issuer,  # type: ignore[arg-type]
                resource_server_url=f"{settings.public_url}/mcp",  # type: ignore[arg-type]
                required_scopes=["openid"],
                validate_token_resource=False,  # Cognito access tokens carry no aud
            ),
        }
    mcp = FastMCP(
        "disci",
        instructions=INSTRUCTIONS,
        # Every request is self-contained (Lambda), and answers are plain JSON, not SSE.
        stateless_http=True,
        json_response=True,
        # DNS-rebinding protection guards servers on localhost; this one is public and
        # every request needs a bearer token.
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
        **auth,
    )
    finance.register(mcp)
    nutrition.register(mcp)
    return mcp


def create_app() -> Starlette:
    """A fresh ASGI app. Its lifespan runs the MCP session manager, which can only be
    started once, so Lambda builds a new app per invocation (cheap: no I/O)."""
    app = build_mcp(get_settings()).streamable_http_app()
    app.add_middleware(RequestLog)
    return app
